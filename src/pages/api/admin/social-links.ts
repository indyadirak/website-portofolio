import type { APIContext } from "astro";
import { getSupabaseFromLocals, isAal2Session, json } from "../../../lib/api";
import { canDeleteSiteContent, canManageSiteContent } from "../../../lib/auth";
import { adminMutationGuard } from "../../../lib/rateLimit";
import { notifyContentPublished } from "../../../lib/deploy";
import type { SocialLinkRow } from "../../../lib/types";

export const prerender = false;

interface SocialLinkInput {
  platform?: unknown;
  url?: unknown;
  icon?: unknown;
  sortOrder?: unknown;
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
  if (!canManageSiteContent(profile)) {
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

/** Guard khusus DELETE: hanya admin (selaras policy RLS delete admin). */
async function guardAdminOnly(
  supabase: ReturnType<typeof getSupabaseFromLocals>,
  locals: App.Locals,
  write = true,
): Promise<GuardResult> {
  if (!supabase) return { error: json({ ok: false, error: "supabase_not_configured" }, 503) };
  const { user, profile } = locals;
  if (!user) return { error: json({ ok: false, error: "unauthorized" }, 401) };
  if (!canDeleteSiteContent(profile)) {
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

/** Ekstraksi + validasi field dari request body. Error string atau null. */
function parseBody(body: SocialLinkInput): {
  error: string | null;
  platform: string;
  url: string;
  icon: string | null;
  sortOrder: number;
} {
  const platform = typeof body.platform === "string" ? body.platform.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const icon = typeof body.icon === "string" ? body.icon.trim() : "";
  const sortOrder = typeof body.sortOrder === "number" ? Math.floor(body.sortOrder) : 0;

  if (!platform || platform.length > 80 || /[\u0000-\u001f\u007f]/.test(platform)) {
    return { error: "platform_invalid", platform, url, icon: null, sortOrder };
  }
  if (!url || url.length > 500 || !/^https?:\/\//.test(url)) return { error: "url_invalid", platform, url, icon: null, sortOrder };
  if (icon.length > 200) return { error: "icon_invalid", platform, url, icon: null, sortOrder };

  return { error: null, platform, url, icon: icon || null, sortOrder };
}

/** Daftar semua social links — urut sort_order, lalu platform. */
export async function GET({ locals }: APIContext) {
  const g = await guard(getSupabaseFromLocals(locals), locals);
  if (g.error) return g.error;

  const { data, error } = await g.supabase
    .from("social_links")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("platform", { ascending: true });

  if (error) {
    console.error("[admin/social-links] GET gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  return json({ ok: true, links: data as unknown as SocialLinkRow[] });
}

/** Buat social link baru. */
export async function POST({ request, locals }: APIContext) {
  const g = await guard(getSupabaseFromLocals(locals), locals, true);
  if (g.error) return g.error;

  let body: SocialLinkInput;
  try {
    body = (await request.json()) as SocialLinkInput;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const v = parseBody(body);
  if (v.error) return json({ ok: false, error: v.error }, 400);

  const { data, error } = await g.supabase
    .from("social_links")
    .insert({ platform: v.platform, url: v.url, icon: v.icon, sort_order: v.sortOrder })
    .select("id")
    .single();

  if (error) {
    console.error("[admin/social-links] INSERT gagal:", error.message);
    if (error.code === "23505") return json({ ok: false, error: "platform_duplicate" }, 409);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  // Footer publik di-prerender — minta rebuild (cooldown, best-effort).
  await notifyContentPublished("social_links");

  return json({ ok: true, id: data.id }, 200);
}

/** Perbarui social link (id via query param `?id=`). */
export async function PUT({ request, locals }: APIContext) {
  const g = await guard(getSupabaseFromLocals(locals), locals, true);
  if (g.error) return g.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_required" }, 400);

  let body: SocialLinkInput;
  try {
    body = (await request.json()) as SocialLinkInput;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const v = parseBody(body);
  if (v.error) return json({ ok: false, error: v.error }, 400);

  const { data, error } = await g.supabase
    .from("social_links")
    .update({ platform: v.platform, url: v.url, icon: v.icon, sort_order: v.sortOrder })
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    console.error("[admin/social-links] UPDATE gagal:", error.message);
    if (error.code === "23505") return json({ ok: false, error: "platform_duplicate" }, 409);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  // Footer publik di-prerender — minta rebuild (cooldown, best-effort).
  await notifyContentPublished("social_links");

  return json({ ok: true, id: data.id }, 200);
}

/** Hapus social link (id via query param `?id=`). DELETE hanya admin. */
export async function DELETE({ request, locals }: APIContext) {
  const g = await guardAdminOnly(getSupabaseFromLocals(locals), locals);
  if (g.error) return g.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_required" }, 400);

  const { error } = await g.supabase.from("social_links").delete().eq("id", id);

  if (error) {
    console.error("[admin/social-links] DELETE gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  // Footer publik di-prerender — minta rebuild (cooldown, best-effort).
  await notifyContentPublished("social_links");

  return json({ ok: true });
}
