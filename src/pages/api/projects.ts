import type { APIContext } from "astro";
import { getSupabaseFromLocals, json } from "../../lib/api";
import {
  canDeleteProjects,
  canManageProjects,
} from "../../lib/auth";
import { adminMutationGuard } from "../../lib/rateLimit";
import type { ProjectStatus } from "../../lib/types";

export const prerender = false;

// TODO: Migrate admin operations to /api/admin/projects.ts
// Separation of concerns: public read vs admin CRUD
// Track: Issue B2-ADMIN-API-MIGRATION
// Catatan: ini temporary architecture — direfactor ke /api/admin/projects.ts
// setelah semua fitur B2 (categories, writeups, dashboard) selesai & stabil.

export interface ProjectInput {
  slug: string;
  title: string;
  summary: string;
  description?: string | null;
  /** Nama kategori legacy (fallback) — diisi otomatis dari FK bila categoryId diberikan. */
  category: string;
  /** FK ke project_categories (B2) — optional: null/undefined = kategori legacy text.
   *  Bila diberikan, API memvalidasi keberadaan kategori & mengisi `category` text
   *  dari nama kategori tersebut (COALESCE di sisi baca tetap memprioritaskan FK). */
  categoryId?: string | null;
  tags?: string[];
  imageUrl?: string | null;
  repoUrl?: string | null;
  liveUrl?: string | null;
  featured: boolean;
  status: ProjectStatus;
  problem?: string | null;
  solution?: string | null;
  impact?: string | null;
}

const VALID_STATUSES: ProjectStatus[] = ["active", "archived", "planned"];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Konversi input (camelCase) -> kolom tabel (snake_case).
 *  category_id: diteruskan bila ada (validasi FK dilakukan sebelumnya).
 *  category: nilai text fallback — dari nama FK bila categoryId dipilih,
 *  atau nilai legacy dari form (mis. insert manual via dashboard). */
function toRow(input: ProjectInput) {
  return {
    slug: input.slug.trim(),
    title: input.title.trim(),
    summary: input.summary.trim(),
    description: input.description?.trim() ?? "",
    category: input.category,
    category_id: input.categoryId ?? null,
    tags: input.tags ?? [],
    image_url: input.imageUrl?.trim() || null,
    repo_url: input.repoUrl?.trim() || null,
    live_url: input.liveUrl?.trim() || null,
    featured: Boolean(input.featured),
    status: input.status,
    problem: input.problem?.trim() || null,
    solution: input.solution?.trim() || null,
    impact: input.impact?.trim() || null,
  };
}

/** Cek kategori FK valid (jika categoryId diberikan) & ambil nama kategori utk
 *  mengisi kolom legacy `category` (fallback). return: { name } | null. */
async function resolveCategory(
  supabase: NonNullable<ReturnType<typeof getSupabaseFromLocals>>,
  input: ProjectInput
): Promise<{ name: string } | null> {
  if (!input.categoryId) return null;
  const { data, error } = await supabase
    .from("project_categories")
    .select("name")
    .eq("id", input.categoryId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/** Validasi input. Kategori TIDAK lagi pakai whitelist hardcode (kategori kini
 *  DINAMIS dari project_categories). Bila categoryId diberikan, `resolved`
 *  adalah baris kategori dari DB (sudah diverifikasi di handler) — dipakai
 *  untuk mengisi kolom legacy `category` secara otomatis. */
function validate(input: ProjectInput, resolved: { name: string } | null): string | null {
  if (!input.title?.trim() || !input.summary?.trim() || !input.slug?.trim()) {
    return "title_summary_slug_wajib_diisi";
  }
  if (!SLUG_RE.test(input.slug.trim())) {
    return "slug_format_lowercase_hyphen";
  }
  if (!input.category?.trim() && !input.categoryId) {
    return "category_wajib_diisi";
  }
  if (!VALID_STATUSES.includes(input.status)) {
    return "status_tidak_valid";
  }
  if (input.categoryId && !resolved) {
    return "category_id_tidak_valid";
  }
  return null;
}

/** Siapkan input utk insert/update: resolve kategori FK (bila ada) dan isi
 *  kolom legacy `category` dari nama kategori. return error validation atau
 *  { input, resolved } siap pakai. */
async function prepareInput(
  body: unknown,
  supabase: NonNullable<ReturnType<typeof getSupabaseFromLocals>>
): Promise<{ error: string } | { input: ProjectInput; resolved: { name: string } | null }> {
  const input = body as ProjectInput;
  if (!input) return { error: "invalid_json" };

  const resolved = input.categoryId ? await resolveCategory(supabase, input) : null;

  const invalid = validate(input, resolved);
  if (invalid) return { error: invalid };

  if (resolved) {
    // Auto-fill kolom legacy: simpan nama kategori resmi (fallback bila FK
    // dihapus / insert manual di masa depan).
    input.category = resolved.name;
  }

  return { input, resolved };
}

async function readInput(request: Request): Promise<ProjectInput | null> {
  try {
    return (await request.json()) as ProjectInput;
  } catch {
    return null;
  }
}

/** CREATE — HANYA admin/editor (RLS juga mensyaratkan aal2). */
export async function POST({ request, locals }: APIContext) {
  const supabase = getSupabaseFromLocals(locals);

  if (!supabase) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }

  const { user, profile } = locals;

  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  if (!canManageProjects(profile)) {
    return json({ ok: false, error: "forbidden_role" }, 403);
  }

  const mutationDecision = await adminMutationGuard.check(user.id);
  if (mutationDecision.reason === "kv_unavailable") {
    // FAIL-CLOSED: KV limiter tidak terjangkau -> tolak, jangan proses tanpa proteksi.
    return json({ ok: false, error: "service_unavailable" }, 503);
  }
  if (!mutationDecision.allowed) {
    return json({ ok: false, error: "too_many_requests" }, 429);
  }

  const input = await readInput(request);
  if (!input) return json({ ok: false, error: "invalid_json" }, 400);

  const prep = await prepareInput(input, supabase);
  if ("error" in prep) return json({ ok: false, error: prep.error }, 400);

  const { data, error } = await supabase
    .from("projects")
    .insert(toRow(prep.input))
    .select("id")
    .single();

  if (error) {
    // RLS (aal2) / unique slug / constraint DB menolak -> ditangkap di sini.
    console.error("[projects] POST insert gagal:", error.message);
    if (error.code === "23505") {
      return json({ ok: false, error: "slug_sudah_dipakai" }, 409);
    }
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  return json({ ok: true, id: data.id }, 201);
}

/** UPDATE — HANYA admin/editor (RLS aal2). */
export async function PUT({ request, locals }: APIContext) {
  const supabase = getSupabaseFromLocals(locals);

  if (!supabase) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }

  const { user, profile } = locals;

  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  if (!canManageProjects(profile)) {
    return json({ ok: false, error: "forbidden_role" }, 403);
  }

  const mutationDecision = await adminMutationGuard.check(user.id);
  if (mutationDecision.reason === "kv_unavailable") {
    // FAIL-CLOSED: KV limiter tidak terjangkau -> tolak, jangan proses tanpa proteksi.
    return json({ ok: false, error: "service_unavailable" }, 503);
  }
  if (!mutationDecision.allowed) {
    return json({ ok: false, error: "too_many_requests" }, 429);
  }

  const input = await readInput(request);
  if (!input) return json({ ok: false, error: "invalid_json" }, 400);

  const prep = await prepareInput(input, supabase);
  if ("error" in prep) return json({ ok: false, error: prep.error }, 400);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_wajib_ada" }, 400);

  const { error } = await supabase
    .from("projects")
    .update(toRow(prep.input))
    .eq("id", id);

  if (error) {
    console.error("[projects] PUT update gagal:", error.message);
    if (error.code === "23505") {
      return json({ ok: false, error: "slug_sudah_dipakai" }, 409);
    }
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  return json({ ok: true });
}

/** DELETE — HANYA admin. */
export async function DELETE({ request, locals }: APIContext) {
  const supabase = getSupabaseFromLocals(locals);

  if (!supabase) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }

  const { user, profile } = locals;

  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  if (!canDeleteProjects(profile)) {
    return json({ ok: false, error: "forbidden_role" }, 403);
  }

  const mutationDecision = await adminMutationGuard.check(user.id);
  if (mutationDecision.reason === "kv_unavailable") {
    // FAIL-CLOSED: KV limiter tidak terjangkau -> tolak, jangan proses tanpa proteksi.
    return json({ ok: false, error: "service_unavailable" }, 503);
  }
  if (!mutationDecision.allowed) {
    return json({ ok: false, error: "too_many_requests" }, 429);
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_wajib_ada" }, 400);

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[projects] DELETE gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  return json({ ok: true });
}
