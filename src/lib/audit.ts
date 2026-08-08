import type { SupabaseClient } from "@supabase/supabase-js";

export type LoginAttemptStatus = "success" | "failed";

export interface LoginAttempt {
  email: string;
  ip?: string | null;
  userAgent?: string | null;
  status: LoginAttemptStatus;
}

/**
 * Catat percobaan login ke tabel `login_attempts` lewat fungsi SECURITY
 * DEFINER (lihat supabase/login-attempts.sql). Fail-silent: error pencatatan
 * TIDAK pernah menggagalkan/mengubah hasil login.
 *
 * Dipanggil HANYA di dalam alur yang sudah lolos loginRateLimiter — jadi
 * volume maksimal = limit rate (5 percobaan/IP/10 menit), tidak bisa
 * dibanjiri jalur pencatatan ini.
 */
export async function recordLoginAttempt(
  supabase: SupabaseClient,
  { email, ip, userAgent, status }: LoginAttempt
): Promise<void> {
  try {
    await supabase.rpc("record_login_attempt", {
      p_email: email,
      p_ip: ip ?? null,
      p_user_agent: userAgent ? userAgent.slice(0, 500) : null,
      p_status: status,
    });
  } catch (err) {
    console.error("login_attempt log gagal:", err);
  }
}
