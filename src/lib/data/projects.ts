import type { Database, Project, ProjectCategoryRow, ProjectsRow, ProjectStatus } from "../types";
import { getSupabase } from "../supabase";
import { demoProjects, demoProjectCategories } from "./demo";

/** Konversi row database -> tipe domain (snake_case -> camelCase).
 *  Kategori tampilan: PRIORITAS FK (project_categories.name), fallback ke
 *  kolom legacy `category` text (B2 additive).
 */
type ProjectWithCategory = ProjectsRow & { project_categories?: { name: string } | null };

function toProject(row: ProjectWithCategory): Project {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    category: row.project_categories?.name ?? row.category,
    categoryId: row.category_id,
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
  category?: string | "all";
  status?: ProjectStatus | "all";
  featuredOnly?: boolean;
}

const PROJECT_SELECT = "*, project_categories(name)";

/** Mengambil semua project dari Supabase (fallback: demo data). */
export async function getProjects(filters: ProjectFilters = {}): Promise<Project[]> {
  const supabase = getSupabase();
  if (!supabase) return demoProjects;

  let query = supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .order("created_at", { ascending: false });

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

  let rows = (data ?? []) as ProjectWithCategory[];

  // Filter kategori DINAMIS di JS: nilai berisi spasi ("Web App"), dan bisa
  // cocok lewat FK (project_categories.name) ATAU kolom legacy (category).
  // Hindari .or() PostgREST yang butuh quoting manual (rentan error).
  if (filters.category && filters.category !== "all") {
    rows = rows.filter((r) => (r.project_categories?.name ?? r.category) === filters.category);
  }

  return rows.map(toProject);
}

/** Mengambil satu project berdasarkan slug. */
export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return demoProjects.find((p) => p.slug === slug) ?? null;
  }

  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[supabase] Gagal mengambil project:", error.message);
    return null;
  }

  return data ? toProject(data) : null;
}

/** Semua kategori aktif, urut sesuai sort_order — sumber filter UI publik.
 *  RLS publik hanya menampilkan is_active = true; admin/editor melihat
 *  SEMUA kategori via policy manage-read (RLS OR antar policy).
 */
export async function getProjectCategories(): Promise<ProjectCategoryRow[]> {
  const supabase = getSupabase();
  if (!supabase) return demoProjectCategories;

  const { data, error } = await supabase
    .from("project_categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("[supabase] Gagal mengambil project_categories:", error.message);
    return [];
  }

  return (data ?? []) as ProjectCategoryRow[];
}

/** Tipe helper agar import tipe database tersedia bagi konsumen modul ini. */
export type { Database };