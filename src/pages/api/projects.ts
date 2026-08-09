import type { APIContext } from "astro";
import { getSupabaseFromLocals, json } from "../../lib/api";
import {
  canDeleteProjects,
  canManageProjects,
} from "../../lib/auth";
import type { ProjectCategory, ProjectStatus } from "../../lib/types";

export const prerender = false;

export interface ProjectInput {
  slug: string;
  title: string;
  summary: string;
  description?: string | null;
  category: ProjectCategory;
  tags?: string[];
  imageUrl?: string | null;
  repoUrl?: string | null;
  liveUrl?: string | null;
  featured: boolean;
  status: ProjectStatus;
  problem?: string | null;
  solution?: string | null;
  impact?: string | null;
}

const VALID_CATEGORIES: ProjectCategory[] = [
  "Web App", "Mobile", "Network", "IoT", "Red Team", "Blue Team", "Defensive", "OSINT", "Forensics",
];
const VALID_STATUSES: ProjectStatus[] = ["active", "archived", "planned"];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Konversi input (camelCase) -> kolom tabel (snake_case). */
function toRow(input: ProjectInput) {
  return {
    slug: input.slug.trim(),
    title: input.title.trim(),
    summary: input.summary.trim(),
    description: input.description?.trim() ?? "",
    category: input.category,
    tags: input.tags ?? [],
    image_url: input.imageUrl?.trim() || null,
    repo_url: input.repoUrl?.trim() || null,
    live_url: input.liveUrl?.trim() || null,
    featured: Boolean(input.featured),
    status: input.status,
    problem: input.problem?.trim() || null,
    solution: input.solution?.trim() || null,
    impact: input.impact?.trim() || null,
  };
}

function validate(input: ProjectInput): string | null {
  if (!input.title?.trim() || !input.summary?.trim() || !input.slug?.trim()) {
    return "title_summary_slug_wajib_diisi";
  }
  if (!SLUG_RE.test(input.slug.trim())) {
    return "slug_format_lowercase_hyphen";
  }
  if (!VALID_CATEGORIES.includes(input.category)) {
    return "category_tidak_valid";
  }
  if (!VALID_STATUSES.includes(input.status)) {
    return "status_tidak_valid";
  }
  return null;
}

async function readInput(request: Request): Promise<ProjectInput | null> {
  try {
    return (await request.json()) as ProjectInput;
  } catch {
    return null;
  }
}

/** CREATE — HANYA admin/editor (RLS juga mensyaratkan aal2). */
export async function POST({ request, locals }: APIContext) {
  const supabase = getSupabaseFromLocals(locals);

  if (!supabase) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }

  const { user, profile } = locals;

  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  if (!canManageProjects(profile)) {
    return json({ ok: false, error: "forbidden_role" }, 403);
  }

  const input = await readInput(request);
  if (!input) return json({ ok: false, error: "invalid_json" }, 400);

  const invalid = validate(input);
  if (invalid) return json({ ok: false, error: invalid }, 400);

  const { data, error } = await supabase
    .from("projects")
    .insert(toRow(input))
    .select("id")
    .single();

  if (error) {
    // RLS (aal2) / unique slug / constraint DB menolak -> ditangkap di sini.
    if (error.code === "23505") {
      return json({ ok: false, error: "slug_sudah_dipakai" }, 409);
    }
    return json({ ok: false, error: error.message }, 403);
  }

  return json({ ok: true, id: data.id }, 201);
}

/** UPDATE — HANYA admin/editor (RLS aal2). */
export async function PUT({ request, locals }: APIContext) {
  const supabase = getSupabaseFromLocals(locals);

  if (!supabase) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }

  const { user, profile } = locals;

  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  if (!canManageProjects(profile)) {
    return json({ ok: false, error: "forbidden_role" }, 403);
  }

  const input = await readInput(request);
  if (!input) return json({ ok: false, error: "invalid_json" }, 400);

  const invalid = validate(input);
  if (invalid) return json({ ok: false, error: invalid }, 400);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_wajib_ada" }, 400);

  const { error } = await supabase
    .from("projects")
    .update(toRow(input))
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return json({ ok: false, error: "slug_sudah_dipakai" }, 409);
    }
    return json({ ok: false, error: error.message }, 403);
  }

  return json({ ok: true });
}

/** DELETE — HANYA admin. */
export async function DELETE({ request, locals }: APIContext) {
  const supabase = getSupabaseFromLocals(locals);

  if (!supabase) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }

  const { user, profile } = locals;

  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  if (!canDeleteProjects(profile)) {
    return json({ ok: false, error: "forbidden_role" }, 403);
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_wajib_ada" }, 400);

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id);

  if (error) return json({ ok: false, error: error.message }, 403);

  return json({ ok: true });
}
