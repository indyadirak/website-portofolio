import type { APIContext } from "astro";
import { getSupabaseFromLocals, json } from "../../../lib/api";
import { canManageMessages } from "../../../lib/auth";
import { adminMutationGuard } from "../../../lib/rateLimit";

export const prerender = false;

/**
 * Manajemen pesan kontak (FASE 2, TUGAS 2.1):
 *   PUT    /api/admin/messages?id=<uuid> — tandai dibaca (is_read = true, idempotent)
 *   DELETE /api/admin/messages?id=<uuid> — hapus pesan (hard delete)
 *
 * Keamanan (selaras RLS contact_messages — supabase/contact-messages-crud.sql):
 *   - Session wajib + role admin/editor (cek ulang di app: defense-in-depth).
 *   - RLS database tetap mensyaratkan aal2 (MFA terverifikasi) + role via
 *     subquery public.profiles — TIDAK pernah auth.jwt() ->> 'role'.
 *   - adminMutationGuard: FAIL-CLOSED, maks 30 mutasi/menit/user.
 *   - id divalidasi format UUID sebelum menyentuh DB.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type GuardResult =
  | { error: Response }
  | {
      error: null;
      supabase: NonNullable<ReturnType<typeof getSupabaseFromLocals>>;
      user: NonNullable<App.Locals["user"]>;
    };

async function guard(
  supabase: ReturnType<typeof getSupabaseFromLocals>,
  locals: App.Locals
): Promise<GuardResult> {
  if (!supabase) return { error: json({ ok: false, error: "supabase_not_configured" }, 503) };
  const { user, profile } = locals;
  if (!user) return { error: json({ ok: false, error: "unauthorized" }, 401) };
  if (!canManageMessages(profile)) {
    return { error: json({ ok: false, error: "forbidden_role" }, 403) };
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

function messageId(request: Request): string | null {
  const id = new URL(request.url).searchParams.get("id");
  return id && UUID_RE.test(id) ? id : null;
}

/** Tandai pesan sebagai dibaca. Idempotent: pesan yang sudah dibaca tetap ok. */
export async function PUT({ request, locals }: APIContext) {
  const g = await guard(getSupabaseFromLocals(locals), locals);
  if (g.error) return g.error;

  const id = messageId(request);
  if (!id) return json({ ok: false, error: "id_invalid" }, 400);

  const { data, error } = await g.supabase
    .from("contact_messages")
    .update({ is_read: true })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[admin/messages] UPDATE gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }
  if (!data) return json({ ok: false, error: "not_found" }, 404);

  return json({ ok: true });
}

/** Hapus pesan (hard delete). Retensi 12 bulan tetap via data-retention.yml. */
export async function DELETE({ request, locals }: APIContext) {
  const g = await guard(getSupabaseFromLocals(locals), locals);
  if (g.error) return g.error;

  const id = messageId(request);
  if (!id) return json({ ok: false, error: "id_invalid" }, 400);

  const { data, error } = await g.supabase
    .from("contact_messages")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[admin/messages] DELETE gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }
  if (!data) return json({ ok: false, error: "not_found" }, 404);

  return json({ ok: true });
}
