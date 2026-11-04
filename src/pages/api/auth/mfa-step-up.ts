import type { APIContext } from "astro";
import { getSupabaseFromLocals, json } from "../../../lib/api";
import { persistMfaSession, resolveMfaStatus } from "../../../lib/auth";
import { mfaVerifyGuard } from "../../../lib/rateLimit";

export const prerender = false;

interface StepUpBody {
  code?: string;
}

/** IP asli klien — prioritas header Cloudflare, lalu X-Forwarded-For. */
function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * Step-up MFA untuk mutasi admin: verifikasi ulang TOTP pada sesi yang
 * SUDAH login (tanpa logout). Dipakai /admin/step-up ketika adminMutationGuard
 * menolak mutasi karena verifikasi TOTP > 24 jam.
 *
 * Faktor TOTP di-resolve dari server (bukan dari body) supaya pemanggil
 * tidak bisa memilih faktor sembarangan. Rate limit memakai mfaVerifyGuard
 * yang sama dengan login MFA (fail-closed).
 */
export async function POST({ request, locals }: APIContext) {
  const user = locals.user;
  if (!user) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const supabase = getSupabaseFromLocals(locals);
  if (!supabase) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }

  const ip = clientIp(request);

  const decision = await mfaVerifyGuard.check(ip);
  if (!decision.allowed) {
    if (decision.reason === "kv_unavailable") {
      return json({ ok: false, error: "service_unavailable" }, 503);
    }
    return json(
      { ok: false, error: "too_many_attempts", retryAfterSec: decision.retryAfterSec ?? 0 },
      429
    );
  }

  let body: StepUpBody;
  try {
    body = (await request.json()) as StepUpBody;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) {
    return json({ ok: false, error: "kode_wajib_6_digit" }, 400);
  }

  const { verifiedTotpFactorId } = await resolveMfaStatus(supabase, user.id);
  if (!verifiedTotpFactorId) {
    return json({ ok: false, error: "mfa_tidak_terdaftar" }, 400);
  }

  const factorId = verifiedTotpFactorId;

  const { data: challenge, error: challengeError } =
    await supabase.auth.mfa.challenge({ factorId });

  if (challengeError || !challenge) {
    return json({ ok: false, error: "mfa_challenge_gagal" }, 400);
  }

  const { data: verified, error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });

  if (verifyError || !verified.access_token) {
    await mfaVerifyGuard.recordFailure(ip);
    return json({ ok: false, error: "kode_mfa_tidak_valid" }, 401);
  }

  await mfaVerifyGuard.recordSuccess(ip);

  try {
    await persistMfaSession(supabase, verified);
  } catch (error) {
    console.error("[api/auth/mfa-step-up] gagal menyimpan sesi:", error);
    return json({ ok: false, error: "session_gagal" }, 502);
  }

  // Token baru memuat timestamp TOTP terbaru di klaim `amr`, sehingga
  // adminMutationGuard berikutnya lolos selama < 24 jam.
  return json({ ok: true });
}
