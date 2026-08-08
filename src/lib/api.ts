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
