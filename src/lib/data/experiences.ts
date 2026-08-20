import type { Experience, ExperienceRow } from "../types";
import { getSupabase } from "../supabase";
import { demoExperiences } from "./demo";

/** Konversi row database -> tipe domain (snake_case -> camelCase). */
function toExperience(row: ExperienceRow): Experience {
  return {
    id: row.id,
    role: row.role,
    company: row.company,
    startDate: row.start_date,
    endDate: row.end_date,
    isCurrent: row.is_current,
    description: row.description,
    sortOrder: row.sort_order,
  };
}

/** Career timeline — urut sort_order (naik), lalu start_date terbaru dulu.
 *  Fallback: demo data (dev tanpa Supabase); error DB -> [] (empty state
 *  elegan di halaman publik). TIDAK PERNAH melempar exception ke SSR.
 */
export async function getExperiences(): Promise<Experience[]> {
  const supabase = getSupabase();
  if (!supabase) return demoExperiences;

  try {
    const { data, error } = await supabase
      .from("experiences")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("start_date", { ascending: false });

    if (error) {
      console.error("[supabase] Gagal mengambil experiences:", error.message);
      return [];
    }

    return Array.isArray(data) ? (data as ExperienceRow[]).map(toExperience) : [];
  } catch (err) {
    console.error("[supabase] Exception di getExperiences:", err);
    return [];
  }
}