import type { Database, Project, ProjectCategoryRow, ProjectsRow, ProjectStatus } from "../types";
import { getSupabase } from "../supabase";
import { demoProjects, demoProjectCategories } from "./demo";

/** Konversi row database -> tipe domain (snake_case -> camelCase).
 *  Kategori tampilan: PRIORITAS FK (project_categories.name via Map),
 *  fallback ke kolom legacy `category` text (B2 additive).
 *
 *  CATATAN: kategori di-COALESCE di JS, BUKAN lewat embedded resource
 *  `project_categories(name)` — join embedded + order(created_at) rentan
 *  error "ambiguous column" karena project_categories juga punya created_at.
 *  Dua query terpisah lebih aman dan 100% valid di sisi PostgreSQL/PostgREST.
 */
function toProject(row: ProjectsRow, categoryNames: Map<string, string>): Project {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    category: categoryNames.get(row.category_id ?? "") ?? row.category ?? "",
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

/** Mengambil semua project dari Supabase (fallback: demo data).
 *  Seluruh blok dibungkus try/catch + Array.isArray guard agar TIDAK PERNAH
 *  melempar exception ke SSR (halaman publik tidak boleh 500).
 */
export async function getProjects(filters: ProjectFilters = {}): Promise<Project[]> {
  const supabase = getSupabase();
  if (!supabase) return demoProjects;

  try {
    let query = supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (filters.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    }
    if (filters.featuredOnly) {
      query = query.eq("featured", true);
    }

    // Dua query independen — tanpa JOIN, tanpa embedded resource.
    const [{ data, error }, categories] = await Promise.all([
      query,
      getProjectCategories(),
    ]);

    if (error) {
      console.error("[supabase] Gagal mengambil projects:", error.message);
      return demoProjects;
    }

    const rows = Array.isArray(data) ? (data as ProjectsRow[]) : [];
    const categoryNames = new Map(categories.map((c) => [c.id, c.name]));

    // Filter kategori DINAMIS di JS: nilai berisi spasi ("Web App"), dan bisa
    // cocok lewat FK (project_categories.name) ATAU kolom legacy (category).
    // Hindari .or() PostgREST yang butuh quoting manual (rentan error).
    if (filters.category && filters.category !== "all") {
      const selected = filters.category;
      return rows
        .filter(
          (r) =>
            (categoryNames.get(r.category_id ?? "") ?? r.category ?? "") === selected
        )
        .map((r) => toProject(r, categoryNames));
    }

    return rows.map((r) => toProject(r, categoryNames));
  } catch (err) {
    console.error("[supabase] Exception di getProjects:", err);
    return demoProjects;
  }
}

/** Mengambil satu project berdasarkan slug (null jika tidak ditemukan /
 *  query gagal — detail page menangani null sebagai not-found). */
export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return demoProjects.find((p) => p.slug === slug) ?? null;
  }

  try {
    const [{ data, error }, categories] = await Promise.all([
      supabase.from("projects").select("*").eq("slug", slug).maybeSingle(),
      getProjectCategories(),
    ]);

    if (error) {
      console.error("[supabase] Gagal mengambil project:", error.message);
      return null;
    }
    if (!data) return null;

    const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
    return toProject(data as ProjectsRow, categoryNames);
  } catch (err) {
    console.error("[supabase] Exception di getProjectBySlug:", err);
    return null;
  }
}

/** Semua kategori aktif, urut sesuai sort_order — sumber filter UI publik.
 *  RLS publik hanya menampilkan is_active = true; admin/editor melihat
 *  SEMUA kategori via policy manage-read (RLS OR antar policy).
 */
export async function getProjectCategories(): Promise<ProjectCategoryRow[]> {
  const supabase = getSupabase();
  if (!supabase) return demoProjectCategories;

  try {
    const { data, error } = await supabase
      .from("project_categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("[supabase] Gagal mengambil project_categories:", error.message);
      return [];
    }

    return Array.isArray(data) ? (data as ProjectCategoryRow[]) : [];
  } catch (err) {
    console.error("[supabase] Exception di getProjectCategories:", err);
    return [];
  }
}

/** Tipe helper agar import tipe database tersedia bagi konsumen modul ini. */
export type { Database };