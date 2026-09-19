import type { APIContext } from "astro";
import { getSupabaseFromLocals, json } from "../../../lib/api";
import { persistMfaSession } from "../../../lib/auth";
import { mfaVerifyGuard } from "../../../lib/rateLimit";

export const prerender = false;

interface VerifyBody {
  factorId?: string;
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
 * Langkah 2 (MFA login): mfa.challenge -> mfa.verify.
 * Sesuai spesifikasi: `(select auth.jwt() ->> 'aal') = 'aal2'` baru bernilai
 * benar setelah faktor kedua diverifikasi; sesi aal2 disimpan ke cookie.
 *
 * Proteksi brute-force kode TOTP (mfaVerifyGuard, lihat src/lib/rateLimit.ts):
 * maks 10 percobaan GAGAL per-IP per 10 menit — FAIL-CLOSED (KV tidak
 * tersedia => 503, verifikasi TIDAK diproses). Benar => counter di-reset.
 */
export async function POST({ request, locals }: APIContext) {
  const supabase = getSupabaseFromLocals(locals);

  if (!supabase) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }

  const ip = clientIp(request);

  // ===== Cek rate limit (per-IP) — FAIL-CLOSED =====
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

  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const factorId = typeof body.factorId === "string" ? body.factorId.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!factorId || !code || !/^\d{6}$/.test(code)) {
    return json({ ok: false, error: "kode_wajib_6_digit" }, 400);
  }

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

  // Kode benar — reset counter.
  await mfaVerifyGuard.recordSuccess(ip);

  // Sesi penuh (aal2) — simpan ke cookie.
  try {
    await persistMfaSession(supabase, verified);
  } catch (error) {
    console.error("[api/auth/mfa-verify] failed to persist AAL2 session:", error);
    return json({ ok: false, error: "session_gagal" }, 502);
  }

  return json({ ok: true, step: "done" });
}
