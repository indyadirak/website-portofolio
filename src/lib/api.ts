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

/** Field kredensial sertifikat (opsional) — dipakai API JSON & multipart. */
export interface CredentialFields {
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
