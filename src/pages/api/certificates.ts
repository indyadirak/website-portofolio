import type { APIContext } from "astro";
import {
  getSupabaseFromLocals,
  isAal2Session,
  json,
  validateCredentialFields,
} from "../../lib/api";
import { normalizeDateInput } from "../../lib/dates";
import {
  canDeleteCertificates,
  canManageCertificates,
} from "../../lib/auth";
import { removeCertificateFile, isSafeStoragePath, isExternalFileUrl, normalizeDriveFileUrl } from "../../lib/storage";
import { adminMutationGuard } from "../../lib/rateLimit";
import type { CertificateCategory, Database } from "../../lib/types";

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

/** Konversi input (camelCase) -> kolom tabel (snake_case). Nilai tanggal
 *  & fileUrl sudah ternormalisasi oleh validate() — jangan lewat sini. */
function toRow(input: CertificateInput, v: ValidatedCertificate) {
  const row: Database["public"]["Tables"]["certificates"]["Update"] = {
    title: input.title.trim(),
    issuer: input.issuer.trim(),
    issue_date: v.issueDate,
    expiry_date: v.expiryDate,
    category: (input.category === "compliance" || input.category === "training"
      ? input.category
      : "training") as CertificateCategory,
    is_featured: input.isFeatured === true,
    short_description_id: sanitizeShortDesc(input.shortDescriptionId),
    short_description_en: sanitizeShortDesc(input.shortDescriptionEn),
    credential_id: input.credentialId?.trim() || null,
    credential_url: input.credentialUrl?.trim() || null,
    verification_url: input.verificationUrl?.trim() || null,
    skills: input.skills ?? [],
    description: input.description ?? null,
  };
  // fileUrl HANYA disertakan bila key ada di body — PUT tanpa key tidak
  // boleh menghapus file yang sudah tersimpan (bug lama: selalu null).
  if (v.fileUrl !== undefined) {
    row.file_url = v.fileUrl;
  }
  return row;
}

interface ValidatedCertificate {
  error: string | null;
  issueDate: string;
  expiryDate: string | null;
  /** undefined = key tidak dikirim (pertahankan file yang ada). */
  fileUrl: string | null | undefined;
}

function validate(input: CertificateInput): ValidatedCertificate {
  const fail = (error: string): ValidatedCertificate => ({
    error,
    issueDate: "",
    expiryDate: null,
    fileUrl: undefined,
  });

  if (!input.title?.trim() || !input.issuer?.trim() || !input.issueDate) {
    return fail("title_issuer_issueDate_wajib_diisi");
  }
  const issueDate = normalizeDateInput(input.issueDate);
  if (!issueDate) return fail("issueDate_format_yyyy_mm_dd");
  let expiryDate: string | null = null;
  if (input.expiryDate) {
    expiryDate = normalizeDateInput(input.expiryDate);
    if (!expiryDate) return fail("expiryDate_format_yyyy_mm_dd");
    if (expiryDate < issueDate) return fail("expiryDate_sebelum_issueDate");
  }
  if (
    input.category !== undefined &&
    !CERTIFICATE_CATEGORIES.includes(input.category as CertificateCategory)
  ) {
    return fail("category_harus_compliance_atau_training");
  }
  const credentialError = validateCredentialFields({
    credentialId: input.credentialId?.trim(),
    credentialUrl: input.credentialUrl?.trim(),
    verificationUrl: input.verificationUrl?.trim(),
  });
  if (credentialError) return fail(credentialError);

  // fileUrl: hanya terima path internal storage (upload) ATAU link Drive
  // yang dinormalisasi. Host lain ditolak (file_url dirender publik).
  let fileUrl: string | null | undefined;
  if (input.fileUrl === undefined) {
    fileUrl = undefined;
  } else if (input.fileUrl === null || input.fileUrl.trim() === "") {
    fileUrl = null;
  } else {
    const trimmed = input.fileUrl.trim();
    if (isSafeStoragePath(trimmed)) {
      // Path bucket internal hasil upload — kompatibel seperti sebelumnya.
      fileUrl = trimmed;
    } else {
      const drive = normalizeDriveFileUrl(trimmed);
      if (!drive) return fail("fileUrl_hanya_drive_link");
      fileUrl = drive;
    }
  }

  return { error: null, issueDate, expiryDate, fileUrl };
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
  if (!(await isAal2Session(supabase))) {
    return json({ ok: false, error: "mfa_required" }, 403);
  }

  const mutationDecision = await adminMutationGuard.check(user.id);
  if (mutationDecision.reason === "kv_unavailable") {
    // FAIL-CLOSED: KV limiter tidak terjangkau -> tolak, jangan proses tanpa proteksi.
    return json({ ok: false, error: "service_unavailable" }, 503);
  }
  if (!mutationDecision.allowed) {
    return json({ ok: false, error: "too_many_requests" }, 429);
  }

  const input = await readInput(request);
  if (!input) return json({ ok: false, error: "invalid_json" }, 400);

  const v = validate(input);
  if (v.error) return json({ ok: false, error: v.error }, 400);

  const { data, error } = await supabase
    .from("certificates")
    .insert(
      { ...toRow(input, v), created_by: user.id } as Database["public"]["Tables"]["certificates"]["Insert"]
    )
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
  if (!(await isAal2Session(supabase))) {
    return json({ ok: false, error: "mfa_required" }, 403);
  }

  const mutationDecision = await adminMutationGuard.check(user.id);
  if (mutationDecision.reason === "kv_unavailable") {
    // FAIL-CLOSED: KV limiter tidak terjangkau -> tolak, jangan proses tanpa proteksi.
    return json({ ok: false, error: "service_unavailable" }, 503);
  }
  if (!mutationDecision.allowed) {
    return json({ ok: false, error: "too_many_requests" }, 429);
  }

  const input = await readInput(request);
  if (!input) return json({ ok: false, error: "invalid_json" }, 400);

  const v = validate(input);
  if (v.error) return json({ ok: false, error: v.error }, 400);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_wajib_ada" }, 400);

  const { error } = await supabase
    .from("certificates")
    .update(toRow(input, v))
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
  if (!(await isAal2Session(supabase))) {
    return json({ ok: false, error: "mfa_required" }, 403);
  }

  const mutationDecision = await adminMutationGuard.check(user.id);
  if (mutationDecision.reason === "kv_unavailable") {
    // FAIL-CLOSED: KV limiter tidak terjangkau -> tolak, jangan proses tanpa proteksi.
    return json({ ok: false, error: "service_unavailable" }, 503);
  }
  if (!mutationDecision.allowed) {
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
  if (existing?.file_url && !isExternalFileUrl(existing.file_url)) {
    await removeCertificateFile(supabase, existing.file_url);
  }

  return json({ ok: true });
}
