import type { Skill, SkillCategory, SkillsRow } from "../types";
import { getSupabase } from "../supabase";
import { demoSiteSkills } from "./demo";

function toSkill(row: SkillsRow): Skill {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    level: row.level,
    icon: row.icon,
  };
}

/** Mengambil semua skill dari Supabase (fallback: demo data). */
export async function getSkills(): Promise<Skill[]> {
  const supabase = getSupabase();
  if (!supabase) return demoSiteSkills;

  const { data, error } = await supabase
    .from("skills")
    .select("*")
    .order("category", { ascending: true });

  if (error) {
    console.error("[supabase] Gagal mengambil skills:", error.message);
    return demoSiteSkills;
  }

  return (data ?? []).map(toSkill);
}

export const skillCategories: SkillCategory[] = [
  "Offensive",
  "Defensive",
  "Tools",
  "Programming",
  "Network",
  "Forensics",
  "Soft Skill",
];
