import type { Database, Project, ProjectCategory, ProjectsRow, ProjectStatus } from "../types";
import { getSupabase } from "../supabase";
import { demoProjects } from "./demo";

/** Konversi row database -> tipe domain (snake_case -> camelCase). */
function toProject(row: ProjectsRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    category: row.category,
    tags: row.tags,
    imageUrl: row.image_url,
    repoUrl: row.repo_url,
    liveUrl: row.live_url,
    featured: row.featured,
    status: row.status,
    problem: row.problem ?? null,
    solution: row.solution ?? null,
    impact: row.impact ?? null,
    createdAt: row.created_at,
  };
}

export interface ProjectFilters {
  category?: ProjectCategory | "all";
  status?: ProjectStatus | "all";
  featuredOnly?: boolean;
}

/** Mengambil semua project dari Supabase (fallback: demo data). */
export async function getProjects(filters: ProjectFilters = {}): Promise<Project[]> {
  const supabase = getSupabase();
  if (!supabase) return demoProjects;

  let query = supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters.category && filters.category !== "all") {
    query = query.eq("category", filters.category);
  }
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.featuredOnly) {
    query = query.eq("featured", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[supabase] Gagal mengambil projects:", error.message);
    return demoProjects;
  }

  return (data ?? []).map(toProject);
}

/** Mengambil satu project berdasarkan slug. */
export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return demoProjects.find((p) => p.slug === slug) ?? null;
  }

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[supabase] Gagal mengambil project:", error.message);
    return null;
  }

  return data ? toProject(data) : null;
}

/** Daftar kategori yang tersedia (dipakai untuk filter UI). */
export const projectCategories: Array<ProjectCategory | "all"> = [
  "all",
  "Web App",
  "Network",
  "Red Team",
  "Blue Team",
  "Defensive",
  "OSINT",
  "Forensics",
  "Mobile",
  "IoT",
];

/** Tipe helper agar import tipe database tersedia bagi konsumen modul ini. */
export type { Database };
