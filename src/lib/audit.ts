import type { SupabaseClient } from "@supabase/supabase-js";
import type { LoginBlockedReason } from "./rateLimit";

export type LoginAttemptStatus = "success" | "failed" | "blocked";

export interface LoginAttempt {
  /** Kredensial yang dicoba — NULL untuk baris blocked (privacy: jangan
   *  simpan detail kredensial percobaan yang ditolak rate limiter). */
  email: string | null;
  ip?: string | null;
  userAgent?: string | null;
  status: LoginAttemptStatus;
  /** Diisi saat status = "blocked": "lockout" | "kv_unavailable". */
  blockedReason?: LoginBlockedReason | null;
}

/**
 * Catat percobaan login ke tabel `login_attempts` lewat fungsi SECURITY
 * DEFINER (lihat supabase/login-attempts.sql). Fail-silent: error pencatatan
 * TIDAK pernah menggagalkan/mengubah hasil login.
 *
 * Dipanggil di dalam alur yang sudah lolos loginAttemptGuard — jadi volume
 * maksimal = limit rate (bounded), tidak bisa dibanjiri jalur pencatatan.
 */
export async function recordLoginAttempt(
  supabase: SupabaseClient,
  { email, ip, userAgent, status, blockedReason }: LoginAttempt
): Promise<void> {
  try {
    await supabase.rpc("record_login_attempt", {
      p_email: email,
      p_ip: ip ?? null,
      p_user_agent: userAgent ? userAgent.slice(0, 500) : null,
      p_status: status,
      p_blocked_reason: blockedReason ?? null,
    });
  } catch (err) {
    console.error("login_attempt log gagal:", err);
  }
}
