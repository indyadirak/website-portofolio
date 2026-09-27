import type { APIContext } from "astro";
import { getSupabaseFromLocals, isAal2Session, json } from "../../../lib/api";
import { canDeleteProjects, canManageProjects } from "../../../lib/auth";
import { adminMutationGuard } from "../../../lib/rateLimit";
import { notifyContentPublished } from "../../../lib/deploy";
import type { ProjectCategoryRow } from "../../../lib/types";

export const prerender = false;

/** Normalisasi slug: lowercase, spasi/lainnya -> "-", buang non-alfanumerik. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

interface CategoryInput {
  name?: unknown;
  slug?: unknown;
  description?: unknown;
  sortOrder?: unknown;
  isActive?: unknown;
}

type GuardResult =
  | { error: Response }
  | {
      error: null;
      supabase: NonNullable<ReturnType<typeof getSupabaseFromLocals>>;
      user: NonNullable<App.Locals["user"]>;
    };

/** Guard terpusat: session + role admin/editor + rate limit mutasi. */
async function guard(
  supabase: ReturnType<typeof getSupabaseFromLocals>,
  locals: App.Locals,
  write = false,
): Promise<GuardResult> {
  if (!supabase) return { error: json({ ok: false, error: "supabase_not_configured" }, 503) };
  const { user, profile } = locals;
  if (!user) return { error: json({ ok: false, error: "unauthorized" }, 401) };
  if (!canManageProjects(profile)) {
    return { error: json({ ok: false, error: "forbidden_role" }, 403) };
  }
  if (write && !(await isAal2Session(supabase))) {
    return { error: json({ ok: false, error: "mfa_required" }, 403) };
  }
  const decision = await adminMutationGuard.check(user.id);
  if (decision.reason === "kv_unavailable") {
    return { error: json({ ok: false, error: "service_unavailable" }, 503) };
  }
  if (!decision.allowed) {
    return { error: json({ ok: false, error: "too_many_requests" }, 429) };
  }
  return { error: null, supabase, user };
}

/** Daftar semua kategori (termasuk non-aktif) — urut sort_order, name. */
export async function GET({ locals }: APIContext) {
  const g = await guard(getSupabaseFromLocals(locals), locals);
  if (g.error) return g.error;

  const { data, error } = await g.supabase
    .from("project_categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("[admin/categories] GET gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  return json({ ok: true, categories: data as unknown as ProjectCategoryRow[] });
}

/** Buat kategori baru. */
export async function POST({ request, locals }: APIContext) {
  const g = await guard(getSupabaseFromLocals(locals), locals, true);
  if (g.error) return g.error;

  let body: CategoryInput;
  try {
    body = (await request.json()) as CategoryInput;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 80) {
    return json({ ok: false, error: "name_invalid" }, 400);
  }

  const slug = typeof body.slug === "string" && body.slug.trim() ? slugify(body.slug) : slugify(name);
  if (!slug) return json({ ok: false, error: "slug_invalid" }, 400);

  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const sortOrder = typeof body.sortOrder === "number" ? Math.floor(body.sortOrder) : 0;
  const isActive = body.isActive === undefined ? true : body.isActive === true;

  const { data, error } = await g.supabase
    .from("project_categories")
    .insert({ name, slug, description: description || null, sort_order: sortOrder, is_active: isActive })
    .select("id")
    .single();

  if (error) {
    console.error("[admin/categories] INSERT gagal:", error.message);
    if (error.code === "23505") return json({ ok: false, error: "name_or_slug_duplicate" }, 409);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  // Filter publik di-prerender — minta rebuild (cooldown, best-effort).
  await notifyContentPublished("project_categories");

  return json({ ok: true, id: data.id }, 200);
}

/** Perbarui kategori (id via query param `?id=`). */
export async function PUT({ request, locals }: APIContext) {
  const g = await guard(getSupabaseFromLocals(locals), locals, true);
  if (g.error) return g.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_wajib_ada" }, 400);

  let body: CategoryInput;
  try {
    body = (await request.json()) as CategoryInput;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const update: Partial<{
    name: string;
    slug: string;
    description: string | null;
    sort_order: number;
    is_active: boolean;
  }> = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 80) return json({ ok: false, error: "name_invalid" }, 400);
    update.name = name;
    if (body.slug === undefined) update.slug = slugify(name);
  }
  if (body.slug !== undefined) {
    const slug = typeof body.slug === "string" ? slugify(body.slug) : "";
    if (!slug) return json({ ok: false, error: "slug_invalid" }, 400);
    update.slug = slug;
  }
  if (body.description !== undefined) {
    update.description = typeof body.description === "string" ? body.description.trim() || null : null;
  }
  if (body.sortOrder !== undefined) {
    update.sort_order = typeof body.sortOrder === "number" ? Math.floor(body.sortOrder) : 0;
  }
  if (body.isActive !== undefined) {
    update.is_active = body.isActive === true;
  }

  const { data, error } = await g.supabase
    .from("project_categories")
    .update(update)
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    console.error("[admin/categories] UPDATE gagal:", error.message);
    if (error.code === "23505") return json({ ok: false, error: "name_or_slug_duplicate" }, 409);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  // Filter publik di-prerender — minta rebuild (cooldown, best-effort).
  await notifyContentPublished("project_categories");

  return json({ ok: true, id: data.id }, 200);
}

/** Hapus kategori (id via query param `?id=`). DELETE hanya admin. */
export async function DELETE({ request, locals }: APIContext) {
  const g = await guardAdminOnly(getSupabaseFromLocals(locals), locals);
  if (g.error) return g.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_wajib_ada" }, 400);

  const { error } = await g.supabase
    .from("project_categories")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[admin/categories] DELETE gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  // Filter publik di-prerender — minta rebuild (cooldown, best-effort).
  await notifyContentPublished("project_categories");

  return json({ ok: true });
}

/** Guard khusus DELETE: hanya admin (selaras policy RLS delete admin). */
async function guardAdminOnly(supabase: ReturnType<typeof getSupabaseFromLocals>, locals: App.Locals): Promise<GuardResult> {
  if (!supabase) return { error: json({ ok: false, error: "supabase_not_configured" }, 503) };
  const { user, profile } = locals;
  if (!user) return { error: json({ ok: false, error: "unauthorized" }, 401) };
  if (!canDeleteProjects(profile)) {
    return { error: json({ ok: false, error: "forbidden_role" }, 403) };
  }
  if (!(await isAal2Session(supabase))) {
    return { error: json({ ok: false, error: "mfa_required" }, 403) };
  }
  const decision = await adminMutationGuard.check(user.id);
  if (decision.reason === "kv_unavailable") {
    return { error: json({ ok: false, error: "service_unavailable" }, 503) };
  }
  if (!decision.allowed) {
    return { error: json({ ok: false, error: "too_many_requests" }, 429) };
  }
  return { error: null, supabase, user };
}
