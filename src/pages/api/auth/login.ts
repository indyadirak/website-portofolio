import type { APIContext } from "astro";
import { getSupabaseFromLocals, json } from "../../../lib/api";
import { getUserProfile, resolveMfaStatus, canManageCertificates } from "../../../lib/auth";
import { loginAttemptGuard } from "../../../lib/rateLimit";
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
 *
 * Proteksi brute-force (loginAttemptGuard, lihat src/lib/rateLimit.ts):
 *   - Lapisan 1: maks 10 percobaan/IP/10 menit (anti enumerasi email)
 *   - Lapisan 2: maks 3 percobaan/IP+email -> lockout progresif 15m..4jam
 *   - FAIL-CLOSED: KV tidak tersedia -> 503, login TIDAK diproses.
 * Pesan 429/503 generik (tidak membocorkan validitas email).
 * Percobaan yang DITOLAK dicatat ke login_attempts sebagai status
 * "blocked" + blocked_reason, TANPA menyimpan kredensial (email NULL).
 */
export async function POST({ request, locals }: APIContext) {
  const supabase = getSupabaseFromLocals(locals);

  if (!supabase) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }

  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const userAgent = request.headers.get("user-agent");

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

  // ===== Cek rate limit (IP + IP&email + lockout) — FAIL-CLOSED =====
  const decision = await loginAttemptGuard.check(ip, email);
  if (!decision.allowed) {
    if (decision.reason === "kv_unavailable") {
      // Fail closed: jangan proses login tanpa proteksi. Pesan generik.
      await recordLoginAttempt(locals.supabase, {
        email: null,
        ip,
        userAgent,
        status: "blocked",
        blockedReason: "kv_unavailable",
      });
      return json({ ok: false, error: "service_unavailable" }, 503);
    }
    // Lockout/limit tercapai — pesan generik, TANPA membocorkan apakah
    // email terdaftar. retryAfterSec hanya angka, aman untuk klien.
    await recordLoginAttempt(locals.supabase, {
      email: null,
      ip,
      userAgent,
      status: "blocked",
      blockedReason: "lockout",
    });
    return json(
      { ok: false, error: "too_many_attempts", retryAfterSec: decision.retryAfterSec ?? 0 },
      429
    );
  }

  const { data, error } = await locals.supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    await loginAttemptGuard.recordFailure(ip, email);
    await recordLoginAttempt(locals.supabase, { email, ip, userAgent, status: "failed" });
    return json({ ok: false, error: "kredensial_salah" }, 401);
  }

  await loginAttemptGuard.recordSuccess(ip, email);
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
