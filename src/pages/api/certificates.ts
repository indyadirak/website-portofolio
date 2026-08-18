import type { APIContext } from "astro";
import { getSupabaseFromLocals, json } from "../../lib/api";
import {
  canDeleteCertificates,
  canManageCertificates,
} from "../../lib/auth";
import { removeCertificateFile } from "../../lib/storage";
import { adminMutationGuard } from "../../lib/rateLimit";
import type { CertificateCategory } from "../../lib/types";

export const prerender = false;

export interface CertificateInput {
  title: string;
  issuer: string;
  issueDate: string;
  expiryDate?: string | null;
  category?: CertificateCategory;
  isFeatured?: boolean;
  shortDescriptionId?: string | null;
  shortDescriptionEn?: string | null;
  credentialId?: string | null;
  credentialUrl?: string | null;
  verificationUrl?: string | null;
  skills?: string[];
  description?: string | null;
  fileUrl?: string | null;
}

const CERTIFICATE_CATEGORIES: CertificateCategory[] = ["compliance", "training"];

/** Maks karakter keterangan singkat (sama dengan counter di form admin). */
const SHORT_DESC_MAX = 150;

function sanitizeShortDesc(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, SHORT_DESC_MAX);
}

/** Konversi input (camelCase) -> kolom tabel (snake_case). */
function toRow(input: CertificateInput) {
  return {
    title: input.title.trim(),
    issuer: input.issuer.trim(),
    issue_date: input.issueDate,
    expiry_date: input.expiryDate ?? null,
    category: (input.category === "compliance" || input.category === "training"
      ? input.category
      : "training") as CertificateCategory,
    is_featured: input.isFeatured === true,
    short_description_id: sanitizeShortDesc(input.shortDescriptionId),
    short_description_en: sanitizeShortDesc(input.shortDescriptionEn),
    credential_id: input.credentialId ?? null,
    credential_url: input.credentialUrl ?? null,
    verification_url: input.verificationUrl ?? null,
    skills: input.skills ?? [],
    description: input.description ?? null,
    file_url: input.fileUrl ?? null,
  };
}

function validate(input: CertificateInput): string | null {
  if (!input.title?.trim() || !input.issuer?.trim() || !input.issueDate) {
    return "title_issuer_issueDate_wajib_diisi";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate)) {
    return "issueDate_format_yyyy-mm-dd";
  }
  if (
    input.category !== undefined &&
    !CERTIFICATE_CATEGORIES.includes(input.category as CertificateCategory)
  ) {
    return "category_harus_compliance_atau_training";
  }
  return null;
}

async function readInput(request: Request): Promise<CertificateInput | null> {
  try {
    return (await request.json()) as CertificateInput;
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
  if (!canManageCertificates(profile)) {
    return json({ ok: false, error: "forbidden_role" }, 403);
  }

  if (!(await adminMutationGuard.check(user.id)).allowed) {
    return json({ ok: false, error: "too_many_requests" }, 429);
  }

  const input = await readInput(request);
  if (!input) return json({ ok: false, error: "invalid_json" }, 400);

  const invalid = validate(input);
  if (invalid) return json({ ok: false, error: invalid }, 400);

  const { data, error } = await supabase
    .from("certificates")
    .insert({ ...toRow(input), created_by: user.id })
    .select("id")
    .single();

  if (error) {
    // RLS (aal2) atau constraint DB menolak -> ditangkap di sini.
    console.error("[certificates] POST insert gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
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
  if (!canManageCertificates(profile)) {
    return json({ ok: false, error: "forbidden_role" }, 403);
  }

  if (!(await adminMutationGuard.check(user.id)).allowed) {
    return json({ ok: false, error: "too_many_requests" }, 429);
  }

  const input = await readInput(request);
  if (!input) return json({ ok: false, error: "invalid_json" }, 400);

  const invalid = validate(input);
  if (invalid) return json({ ok: false, error: invalid }, 400);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_wajib_ada" }, 400);

  const { error } = await supabase
    .from("certificates")
    .update(toRow(input))
    .eq("id", id);

  if (error) {
    console.error("[certificates] PUT update gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
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
  if (!canDeleteCertificates(profile)) {
    return json({ ok: false, error: "forbidden_role" }, 403);
  }

  if (!(await adminMutationGuard.check(user.id)).allowed) {
    return json({ ok: false, error: "too_many_requests" }, 429);
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_wajib_ada" }, 400);

  // Baca file_url sebelum delete, untuk pembersihan Storage setelah sukses.
  const { data: existing } = await supabase
    .from("certificates")
    .select("file_url")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("certificates")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[certificates] DELETE gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  // File di Storage dihapus setelah DELETE DB sukses (best-effort).
  if (existing?.file_url) {
    await removeCertificateFile(supabase, existing.file_url);
  }

  return json({ ok: true });
}
