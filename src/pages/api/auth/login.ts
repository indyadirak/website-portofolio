import type { APIContext } from "astro";
import { getSupabaseFromLocals, json } from "../../../lib/api";
import { getUserProfile, resolveMfaStatus, canManageCertificates } from "../../../lib/auth";
import { loginRateLimiter } from "../../../lib/rateLimit";
import { recordLoginAttempt } from "../../../lib/audit";

export const prerender = false;

interface LoginBody {
  email?: string;
  password?: string;
}

/**
 * Langkah 1: email + password.
 * - Berhasil tanpa MFA (viewer, atau sudah aal2)      -> step "done"
 * - Berhasil, punya faktor TOTP terverifikasi          -> step "mfa"  (tampilkan input 6 digit)
 * - Berhasil, admin/editor tanpa faktor TOTP           -> step "enroll" (wajib enrollment MFA)
 */
export async function POST({ request, locals }: APIContext) {
  const supabase = getSupabaseFromLocals(locals);

  if (!supabase) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }

  // ===== Proteksi rate limit (SATU mekanisme untuk proteksi + logger) =====
  // Cek SEBELUM membaca body & sebelum autentikasi. Saat diblokir, permintaan
  // ditolak TANPA dicatat: dengan begitu logger hanya pernah mencatat maksimal
  // `max` percobaan per IP per window (bounded), bukan satu baris per request.
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    undefined;
  const userAgent = request.headers.get("user-agent");
  if (!loginRateLimiter.isAllowed(ip ?? "unknown")) {
    return json({ ok: false, error: "too_many_attempts" }, 429);
  }

  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!email || !password) {
    return json({ ok: false, error: "email_dan_password_wajib_diisi" }, 400);
  }

  const { data, error } = await locals.supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    await recordLoginAttempt(locals.supabase, { email, ip, userAgent, status: "failed" });
    return json({ ok: false, error: "kredensial_salah" }, 401);
  }

  await recordLoginAttempt(locals.supabase, { email, ip, userAgent, status: "success" });

  // Simpan sesi awal (aal1) ke cookie — sesi belum "penuh" jika ada MFA.
  await locals.supabase.auth.setSession(data.session);

  const { currentLevel, verifiedTotpFactorId } = await resolveMfaStatus(
    locals.supabase,
    data.user.id
  );

  // Sudah level penuh (aal2) — selesai.
  if (currentLevel === "aal2") {
    return json({ ok: true, step: "done" });
  }

  // Ada faktor TOTP terverifikasi — wajib challenge + verify 6 digit dulu.
  if (verifiedTotpFactorId) {
    return json({ ok: true, step: "mfa", factorId: verifiedTotpFactorId });
  }

  // Belum punya MFA sama sekali: admin/editor wajib enroll saat first login.
  const profile = await getUserProfile(locals.supabase, data.user.id);
  if (canManageCertificates(profile)) {
    return json({ ok: true, step: "enroll" });
  }

  // Viewer (atau profil tidak ditemukan): akses baca tanpa MFA.
  return json({ ok: true, step: "done" });
}
