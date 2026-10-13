import type { Database, Project, ProjectCategoryMapRow, ProjectCategoryRow, ProjectsRow, ProjectStatus } from "../types";
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
 *
 *  Batch-4 B1 (multi-kategori): urutan nama = junction map dulu, lalu FK
 *  tunggal (primer), lalu legacy text. `categories` dipakai filter OR publik,
 *  `category` = nama primer (kompatibel tampilan lama).
 */
function toProject(
  row: ProjectsRow,
  categoryNames: Map<string, string>,
  mappedIds: string[],
): Project {
  const fkName = categoryNames.get(row.category_id ?? "");
  const orderedIds = [...mappedIds];
  if (row.category_id && !orderedIds.includes(row.category_id)) {
    orderedIds.push(row.category_id);
  }
  const names: string[] = [];
  for (const id of orderedIds) {
    const name = categoryNames.get(id);
    if (name && !names.includes(name)) names.push(name);
  }
  const primary = names[0] ?? fkName ?? row.category ?? "";
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    category: primary,
    categoryId: row.category_id,
    categories: names.length > 0 ? names : primary ? [primary] : [],
    categoryIds: orderedIds,
    tags: row.tags,
    imageUrl: row.image_url,
    repoUrl: row.repo_url,
    liveUrl: row.live_url,
    featured: row.featured,
    status: row.status,
    problem: row.problem ?? null,
    solution: row.solution ?? null,
    impact: row.impact ?? null,
    methodology: row.methodology ?? null,
    attackPath: row.attack_path ?? null,
    detection: row.detection ?? null,
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

    // Tiga query independen — tanpa JOIN, tanpa embedded resource.
    const [{ data, error }, categories, mapRows] = await Promise.all([
      query,
      getProjectCategories(),
      getProjectCategoryMap(),
    ]);

    if (error) {
      console.error("[supabase] Gagal mengambil projects:", error.message);
      return demoProjects;
    }

    const rows = Array.isArray(data) ? (data as ProjectsRow[]) : [];
    const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
    const mapByProject = new Map<string, string[]>();
    for (const m of mapRows) {
      const list = mapByProject.get(m.project_id) ?? [];
      list.push(m.category_id);
      mapByProject.set(m.project_id, list);
    }

    const withCats = rows.map((r) =>
      toProject(r, categoryNames, mapByProject.get(r.id) ?? [])
    );

    // Filter kategori DINAMIS di JS: nilai berisi spasi ("Web App"), dan bisa
    // cocok lewat junction map, FK (project_categories.name), ATAU kolom
    // legacy (category). Hindari .or() PostgREST yang butuh quoting manual.
    if (filters.category && filters.category !== "all") {
      const selected = filters.category;
      return withCats.filter(
        (p) => p.categories.includes(selected) || p.category === selected
      );
    }

    return withCats;
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

    const row = data as ProjectsRow;
    const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
    const mapRows = await getProjectCategoryMap([row.id]);
    return toProject(
      row,
      categoryNames,
      mapRows.map((m) => m.category_id)
    );
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

/** Semua baris junction project_category_map (opsional: batasi ke projectIds).
 *  Tabel belum ada di DB lama (migrasi B1 belum dijalankan) -> [] + fallback
 *  single-kategori via FK/legacy di toProject. TIDAK PERNAH melempar ke SSR. */
export async function getProjectCategoryMap(
  projectIds?: string[]
): Promise<ProjectCategoryMapRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    let query = supabase
      .from("project_category_map")
      .select("project_id, category_id, created_at");
    if (projectIds && projectIds.length > 0) {
      query = query.in("project_id", projectIds);
    }
    const { data, error } = await query;

    if (error) {
      console.error(
        "[supabase] Gagal mengambil project_category_map (fallback single-kategori):",
        error.message
      );
      return [];
    }

    return Array.isArray(data) ? (data as ProjectCategoryMapRow[]) : [];
  } catch (err) {
    console.error("[supabase] Exception di getProjectCategoryMap:", err);
    return [];
  }
}

/** Tipe helper agar import tipe database tersedia bagi konsumen modul ini. */
export type { Database };