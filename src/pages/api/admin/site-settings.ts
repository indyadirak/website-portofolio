import type { APIContext } from "astro";
import { getSupabaseFromLocals, isAal2Session, json } from "../../../lib/api";
import { canManageSiteContent } from "../../../lib/auth";
import { adminMutationGuard } from "../../../lib/rateLimit";
import { notifyContentPublished } from "../../../lib/deploy";
import {
  SITE_SETTING_KEYS,
  type AvailabilityStatus,
  type SiteSettingRow,
} from "../../../lib/types";

export const prerender = false;

const AVAILABILITY_VALUES: AvailabilityStatus[] = ["open-to-work", "not-available"];

type GuardResult =
  | { error: Response }
  | {
      error: null;
      supabase: NonNullable<ReturnType<typeof getSupabaseFromLocals>>;
      user: NonNullable<App.Locals["user"]>;
    };

/** Guard terpusat: session + role admin/editor + rate limit mutasi.
 *  `write=true` menuntut AAL2 (hanya jalur tulis — policy RLS tulis
 *  mensyaratkan aal2; GET tetap bisa dengan sesi aal1). */
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
    // Sesi belum AAL2 — policy RLS tulis pasti menolak; beri tahu sebabnya.
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

/** Daftar semua site settings (key -> value) — urut key. */
export async function GET({ locals }: APIContext) {
  const g = await guard(getSupabaseFromLocals(locals), locals);
  if (g.error) return g.error;

  const { data, error } = await g.supabase
    .from("site_settings")
    .select("id, key, value, created_at, updated_at")
    .order("key", { ascending: true });

  if (error) {
    console.error("[admin/site-settings] GET gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  return json({ ok: true, settings: data as unknown as SiteSettingRow[] });
}

/** Perbarui satu setting (`?key=`). Insert bila row belum ada. */
export async function PUT({ request, locals }: APIContext) {
  const g = await guard(getSupabaseFromLocals(locals), locals, true);
  if (g.error) return g.error;

  const key = new URL(request.url).searchParams.get("key");
  if (!key || !(SITE_SETTING_KEYS as readonly string[]).includes(key)) {
    return json({ ok: false, error: "key_invalid" }, 400);
  }
  const settingKey = key as (typeof SITE_SETTING_KEYS)[number];

  let body: { value?: unknown };
  try {
    body = (await request.json()) as { value?: unknown };
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const value = typeof body.value === "string" ? body.value.trim() : "";
  if (value.length > 1000) return json({ ok: false, error: "value_too_long" }, 400);

  if (key === "availability_status" && !(AVAILABILITY_VALUES as string[]).includes(value)) {
    return json({ ok: false, error: "availability_invalid" }, 400);
  }

  // Upsert atomik (key punya UNIQUE constraint) — menggantikan pola
  // update-lalu-insert yang bisa race: UPDATE 0 rows karena RLS/aal1
  // kemudian INSERT menabrak unique(key) -> pesan error samar.
  const { error } = await g.supabase
    .from("site_settings")
    .upsert({ key: settingKey, value }, { onConflict: "key" });

  if (error) {
    console.error("[admin/site-settings] UPSERT gagal:", error.message);
    if (error.code === "42501") return json({ ok: false, error: "mfa_required" }, 403);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  // Identitas publik di-prerender — minta rebuild (cooldown, best-effort).
  await notifyContentPublished("site_settings");

  return json({ ok: true, key }, 200);
}
