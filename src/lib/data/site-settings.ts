import type { SiteSettingKey, SiteSettingRow } from "../types";
import { getSupabase } from "../supabase";
import { demoSiteSettings } from "./demo";

/** Mengambil semua identitas dinamis (key/value) dari tabel site_settings.
 *  Fallback: demo data (dev tanpa Supabase); error DB -> [] (halaman publik
 *  memakai nilai i18n/config). TIDAK PERNAH melempar exception ke SSR.
 */
export async function getSiteSettings(): Promise<SiteSettingRow[]> {
  const supabase = getSupabase();
  if (!supabase) return demoSiteSettings;

  try {
    const { data, error } = await supabase
      .from("site_settings")
      .select("id, key, value, created_at, updated_at")
      .order("key", { ascending: true });

    if (error) {
      console.error("[supabase] Gagal mengambil site_settings:", error.message);
      return [];
    }

    return Array.isArray(data) ? (data as SiteSettingRow[]) : [];
  } catch (err) {
    console.error("[supabase] Exception di getSiteSettings:", err);
    return [];
  }
}

/** Nilai satu key identitas, null jika belum diset / query gagal. */
export async function getSiteSettingValue(key: SiteSettingKey): Promise<string | null> {
  const settings = await getSiteSettings();
  return settings.find((s) => s.key === key)?.value ?? null;
}