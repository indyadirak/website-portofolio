import { getTurnstileSecretKey, turnstile } from "./config";

/**
 * Verifikasi token Cloudflare Turnstile di sisi server.
 *
 * Dipakai bersama oleh form kontak publik (/api/contact) dan login admin
 * (/api/auth/login) supaya kontraknya satu:
 *   - siteKey kosong  -> Turnstile tidak dikonfigurasi (mode dev), lolos.
 *   - secret hilang   -> FAIL CLOSED (widget tampil tetapi verifikasi tidak
 *                        bisa dijalankan; jangan biarkan submit lolos).
 *   - token kosong    -> gagal.
 *   - selain itu      -> panggil siteverify resmi Cloudflare.
 *
 * PENTING: body siteverify HARUS `application/x-www-form-urlencoded`
 * (URLSearchParams). Body JSON ditolak Cloudflare.
 */
export type TurnstileFailureReason =
  | "not_configured"
  | "secret_missing"
  | "token_missing"
  | "request_failed"
  | "rejected";

export interface TurnstileVerifyResult {
  ok: boolean;
  reason?: TurnstileFailureReason;
}

export async function verifyTurnstileToken(
  token: string | null,
  remoteIp: string
): Promise<TurnstileVerifyResult> {
  if (!turnstile.siteKey) {
    return { ok: true, reason: "not_configured" };
  }

  const secret = getTurnstileSecretKey();
  if (!secret) {
    console.error(
      "[turnstile] TURNSTILE_SECRET_KEY tidak tersedia di runtime — " +
        "set via `npx wrangler secret put TURNSTILE_SECRET_KEY`."
    );
    return { ok: false, reason: "secret_missing" };
  }

  if (!token) {
    return { ok: false, reason: "token_missing" };
  }

  const form = new URLSearchParams({ secret, response: token });
  if (remoteIp && remoteIp !== "unknown") {
    form.set("remoteip", remoteIp);
  }

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  }).catch(() => null);

  if (!res) {
    console.error("[turnstile] Request verifikasi gagal (jaringan)");
    return { ok: false, reason: "request_failed" };
  }

  const data = (await res.json().catch(() => null)) as {
    success?: boolean;
    "error-codes"?: string[];
  } | null;

  if (data?.success === true) {
    return { ok: true };
  }

  console.error("[turnstile] Token ditolak:", data?.["error-codes"]?.join(",") ?? "unknown");
  return { ok: false, reason: "rejected" };
}
