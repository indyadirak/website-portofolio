import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/** Helper respons JSON untuk API routes. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Mengambil client dari locals dengan pengecekan runtime.
 * `locals.supabase` tidak ter-set saat Supabase belum dikonfigurasi,
 * sehingga API mengembalikan 503 alih-alih crash 500.
 */
export function getSupabaseFromLocals(
  locals: App.Locals
): SupabaseClient<Database> | null {
  return locals.supabase ?? null;
}

/** Field kredensial sertifikat (opsional) — dipakai API JSON & multipart. */export interface CredentialFields {
  credentialId?: string | null;
  credentialUrl?: string | null;
  verificationUrl?: string | null;
}

/** ID kredensial issuer: alphanumeric + pemisah umum, maks 120 karakter. */
const CREDENTIAL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9 ._\-:@/#]{0,119}$/;

function isHttpUrl(value: string): boolean {
  if (value.length > 500) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Validasi server-side (fail-closed) untuk field kredensial sertifikat.
 * Mengembalikan pesan error atau null bila valid. URL wajib http/https
 * — menolak `javascript:`/`data:` yang bisa masuk lewat field bebas.
 */
export function validateCredentialFields(input: CredentialFields): string | null {
  if (input.credentialId && !CREDENTIAL_ID_RE.test(input.credentialId)) {
    return "credentialId_format_tidak_valid";
  }
  if (input.credentialUrl && !isHttpUrl(input.credentialUrl)) {
    return "credentialUrl_harus_http_https";
  }
  if (input.verificationUrl && !isHttpUrl(input.verificationUrl)) {
    return "verificationUrl_harus_http_https";
  }
  return null;
}

/**
 * Pemeriksaan AAL2 (MFA terverifikasi) pada sesi server-side.
 * Policy RLS tulis di produksi mensyaratkan `(select auth.jwt()->>'aal')='aal2'`
 * — sesi lama aal1 membuat UPDATE tidak match baris apa pun dan INSERT
 * ditolak, yang selama ini tampil sebagai "db_operation_failed" samar.
 * Deteksi di aplikasi menghasilkan pesan yang jelas + status 403 khusus.
 */
export async function isAal2Session(
  supabase: SupabaseClient<Database>
): Promise<boolean> {
  try {
    // API MFA berubah nama antar versi supabase-js (getAuthenticatorAssuranceLevel
    // -> getAALLevel). Deteksi kedua bentuk; tidak ada = anggap bukan aal2.
    const mfa = (supabase.auth as unknown as {
      mfa?: {
        getAALLevel?: () => Promise<{ data?: { currentLevel?: string }; error?: unknown }>;
        getAuthenticatorAssuranceLevel?: () => Promise<{ data?: { currentLevel?: string }; error?: unknown }>;
      };
    }).mfa;
    const fn = mfa?.getAALLevel ?? mfa?.getAuthenticatorAssuranceLevel;
    if (!fn || !mfa) return false;
    const { data, error } = await fn.call(mfa);
    return !error && data?.currentLevel === "aal2";
  } catch {
    // Fail-closed konsisten dengan kebijakan rate limit: tidak yakin = tolak.
    return false;
  }
}
