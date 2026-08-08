import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

/** `true` jika kredensial Supabase tersedia di environment. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let serverClient: SupabaseClient<Database> | null = null;
let browserClient: SupabaseClient<Database> | null = null;

/**
 * Server-side Supabase client (dipakai di build-time / SSG).
 * Tidak menyimpan session — hanya untuk query data publik.
 * Mengembalikan `null` jika belum dikonfigurasi (fallback ke demo data).
 */
export function getSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured) {
    console.warn(
      "[supabase] PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY belum diatur — menggunakan demo data."
    );
    return null;
  }

  if (!serverClient) {
    serverClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return serverClient;
}

/**
 * Browser Supabase client untuk alur auth: login, MFA (TOTP challenge),
 * dan operasi mutasi (INSERT/UPDATE/DELETE) yang butuh session + aal2.
 * Session disimpan di localStorage (persistSession: true).
 * Mengembalikan `null` jika belum dikonfigurasi.
 */
export function getBrowserClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured) {
    console.warn(
      "[supabase] PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY belum diatur — auth tidak tersedia."
    );
    return null;
  }

  if (!browserClient) {
    browserClient = createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "portofolio-auth",
      },
    });
  }

  return browserClient;
}
