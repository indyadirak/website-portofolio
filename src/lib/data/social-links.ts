import type { SocialLink, SocialLinkRow } from "../types";
import { getSupabase } from "../supabase";
import { demoSocialLinks } from "./demo";

/** Konversi row database -> tipe domain (snake_case -> camelCase). */
function toSocialLink(row: SocialLinkRow): SocialLink {
  return {
    id: row.id,
    platform: row.platform,
    url: row.url,
    icon: row.icon,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

/** Tautan sosial (public read via RLS) — urut sort_order. Fallback: demo
 *  data (dev tanpa Supabase); error DB -> [] (empty state elegan).
 *  TIDAK PERNAH melempar exception ke SSR.
 */
export async function getSocialLinks(): Promise<SocialLink[]> {
  const supabase = getSupabase();
  if (!supabase) return demoSocialLinks;

  try {
    const { data, error } = await supabase
      .from("social_links")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[supabase] Gagal mengambil social_links:", error.message);
      return [];
    }

    return Array.isArray(data) ? (data as SocialLinkRow[]).map(toSocialLink) : [];
  } catch (err) {
    console.error("[supabase] Exception di getSocialLinks:", err);
    return [];
  }
}