import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";
import type { Database, Profile, ProfilesRow, UserRole } from "./types";

export const isSupabaseConfigured = Boolean(
  import.meta.env.PUBLIC_SUPABASE_URL && import.meta.env.PUBLIC_SUPABASE_ANON_KEY
);

export const ADMIN_BASE = "/admin";
export const ADMIN_LOGIN = `${ADMIN_BASE}/login`;
export const ADMIN_DASHBOARD = `${ADMIN_BASE}/dashboard`;

/**
 * Membuat Supabase server client berbasis cookie (untuk SSR).
 * Session user dibaca/ditulis lewat AstroCookies — digunakan di middleware
 * dan seluruh halaman/API admin.
 *
 * Catatan: Astro 7 tidak lagi menyediakan `cookies.getAll()`; karena itu
 * cookie mentah dibaca dari header request via parseCookieHeader().
 */
export function createServerSupabase(
  cookies: AstroCookies,
  request: Request
): SupabaseClient<Database> {
  return createServerClient<Database>(
    import.meta.env.PUBLIC_SUPABASE_URL!,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      cookies: {
        getAll() {
          const header = request.headers.get("cookie");
          if (!header) return [];
          return parseCookieHeader(header);
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookies.set(name, value, options);
          });
        },
      },
    }
  );
}

function toProfile(row: ProfilesRow): Profile {
  return {
    id: row.id,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    mfaEnforced: row.mfa_enforced,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Membaca role user dari tabel profiles (RLS: hanya baris milik sendiri). */
export async function getUserProfile(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[auth] Gagal membaca profiles:", error.message);
    return null;
  }

  return data ? toProfile(data) : null;
}

export function hasRole(profile: Profile | null, ...roles: UserRole[]): boolean {
  return profile !== null && roles.includes(profile.role);
}

export function canManageCertificates(profile: Profile | null): boolean {
  return hasRole(profile, "admin", "editor");
}

export function canDeleteCertificates(profile: Profile | null): boolean {
  return hasRole(profile, "admin");
}

export interface AuthContext {
  supabase: SupabaseClient<Database>;
  user: User | null;
  profile: Profile | null;
}

export interface MfaStatus {
  currentLevel: "aal1" | "aal2";
  /** id faktor TOTP terverifikasi (null jika belum ada faktor aktif). */
  verifiedTotpFactorId: string | null;
}

/**
 * Resolusi status MFA user pada session saat ini.
 * - currentLevel: 'aal1' (belum MFA) atau 'aal2' (MFA terverifikasi).
 * - verifiedTotpFactorId: faktor TOTP terverifikasi (untuk mfa.challenge).
 */
export async function resolveMfaStatus(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<MfaStatus> {
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const currentLevel: "aal1" | "aal2" =
    aalData?.currentLevel === "aal2" ? "aal2" : "aal1";

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verifiedTotp = (factors?.totp ?? []).find((f) => f.status === "verified");
  void userId;

  return { currentLevel, verifiedTotpFactorId: verifiedTotp?.id ?? null };
}

/**
 * Supabase versi terbaru mengembalikan raw token dari mfa.verify
 * dan `setSession` hanya butuh access+refresh token (session dibangun
 * ulang dari JWT). Sesi aal2 penuh kemudian tersimpan ke cookie.
 */
export async function persistMfaSession(
  supabase: SupabaseClient<Database>,
  data: {
    access_token: string;
    refresh_token: string;
  }
): Promise<void> {
  const { error } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (error) {
    throw error;
  }
}
