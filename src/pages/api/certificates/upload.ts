import type { APIContext } from "astro";
import { getSupabaseFromLocals, json } from "../../../lib/api";
import { canManageCertificates } from "../../../lib/auth";
import {
  removeCertificateFile,
  uploadCertificateFile,
  validateUploadFile,
} from "../../../lib/storage";
import type { CertificateCategory } from "../../../lib/types";

export const prerender = false;

interface CertificateMeta {
  title: string;
  issuer: string;
  issueDate: string;
  category: CertificateCategory;
  expiryDate?: string | null;
  isFeatured: boolean;
  shortDescriptionId?: string | null;
  shortDescriptionEn?: string | null;
  credentialUrl?: string | null;
  verificationUrl?: string | null;
  skills: string[];
}

const CERTIFICATE_CATEGORIES: CertificateCategory[] = ["compliance", "training"];

/** Maks karakter keterangan singkat (sama dengan counter di form admin). */
const SHORT_DESC_MAX = 150;

function sanitizeShortDesc(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, SHORT_DESC_MAX);
}

function parseMeta(formData: FormData): CertificateMeta | null {
  const title = formData.get("title");
  const issuer = formData.get("issuer");
  const issueDate = formData.get("issueDate");
  if (typeof title !== "string" || typeof issuer !== "string" || typeof issueDate !== "string") {
    return null;
  }

  const expiry = formData.get("expiryDate");
  const url = formData.get("credentialUrl");
  const verificationUrl = formData.get("verificationUrl");
  const rawSkills = formData.get("skills");
  const rawCategory = formData.get("category");
  const category =
    rawCategory === "compliance" || rawCategory === "training" ? rawCategory : "training";
  const rawFeatured = formData.get("isFeatured");
  const shortId = formData.get("shortDescriptionId");
  const shortEn = formData.get("shortDescriptionEn");

  return {
    title,
    issuer,
    issueDate,
    category,
    expiryDate: typeof expiry === "string" && expiry ? expiry : null,
    isFeatured: rawFeatured === "on" || rawFeatured === "true" || rawFeatured === "1",
    shortDescriptionId: sanitizeShortDesc(typeof shortId === "string" ? shortId : null),
    shortDescriptionEn: sanitizeShortDesc(typeof shortEn === "string" ? shortEn : null),
    credentialUrl: typeof url === "string" && url ? url : null,
    verificationUrl: typeof verificationUrl === "string" && verificationUrl ? verificationUrl : null,
    skills:
      typeof rawSkills === "string"
        ? rawSkills.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
  };
}

function validateMeta(meta: CertificateMeta): string | null {
  if (!meta.title.trim() || !meta.issuer.trim() || !meta.issueDate) {
    return "title_issuer_issueDate_wajib_diisi";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.issueDate)) {
    return "issueDate_format_yyyy-mm-dd";
  }
  if (!CERTIFICATE_CATEGORIES.includes(meta.category)) {
    return "category_harus_compliance_atau_training";
  }
  return null;
}

/**
 * Upload file sertifikat + INSERT sertifikat (dengan file).
 *
 * Alur keamanan:
 * 1. Validasi MIME type ULANG di server (magic bytes) — validasi client
 *    saja tidak cukup karena header bisa dipalsukan.
 * 2. Upload ke Supabase Storage (bucket privat, path acak).
 * 3. INSERT ke tabel certificates.
 * 4. Jika INSERT GAGAL setelah upload sukses -> file di Storage dihapus
 *    (rollback) agar tidak menjadi orphan file.
 */
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

  const formData = await request.formData().catch(() => null);
  if (!formData) return json({ ok: false, error: "invalid_multipart" }, 400);

  const meta = parseMeta(formData);
  if (!meta) return json({ ok: false, error: "invalid_fields" }, 400);

  const metaError = validateMeta(meta);
  if (metaError) return json({ ok: false, error: metaError }, 400);

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return json({ ok: false, error: "file_wajib_ada" }, 400);
  }

  // ===== Validasi MIME type server-side (magic bytes) =====
  const validation = await validateUploadFile(file);
  if (!validation.ok) {
    return json({ ok: false, error: validation.error }, 400);
  }

  let uploadedPath: string | null = null;

  try {
    // ===== Upload ke Storage =====
    const { path, error } = await uploadCertificateFile(
      supabase,
      user.id,
      file,
      validation.ext!,
      validation.mime!
    );
    if (error || !path) {
      return json({ ok: false, error: error ?? "upload_gagal" }, 400);
    }
    uploadedPath = path;

    // ===== INSERT ke PostgreSQL =====
    const { error: insertError } = await supabase.from("certificates").insert({
      title: meta.title.trim(),
      issuer: meta.issuer.trim(),
      issue_date: meta.issueDate,
      expiry_date: meta.expiryDate,
      category: meta.category,
      is_featured: meta.isFeatured,
      short_description_id: meta.shortDescriptionId,
      short_description_en: meta.shortDescriptionEn,
      credential_url: meta.credentialUrl,
      verification_url: meta.verificationUrl,
      skills: meta.skills,
      file_url: path,
      created_by: user.id,
    });

    if (insertError) {
      // ===== ROLLBACK: upload sukses tapi INSERT gagal -> hapus file =====
      console.error("[upload] INSERT gagal, rollback file:", insertError.message);
      await removeCertificateFile(supabase, uploadedPath);
      uploadedPath = null;
      return json({ ok: false, error: insertError.message }, 403);
    }

    return json({ ok: true, path }, 201);
  } catch (err) {
    // Jaring pengaman: error tak terduga setelah upload -> hapus file.
    if (uploadedPath) {
      await removeCertificateFile(supabase, uploadedPath);
    }
    console.error("[upload] Error tak terduga:", err);
    return json({ ok: false, error: "internal_error" }, 500);
  }
}

/**
 * UPDATE sertifikat dengan file baru (bisa dipakai admin/editor untuk
 * mengganti file). File lama dihapus HANYA setelah UPDATE sukses;
 * jika UPDATE gagal, file baru di-rollback.
 */
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

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_wajib_ada" }, 400);

  const formData = await request.formData().catch(() => null);
  if (!formData) return json({ ok: false, error: "invalid_multipart" }, 400);

  const meta = parseMeta(formData);
  if (!meta) return json({ ok: false, error: "invalid_fields" }, 400);

  const metaError = validateMeta(meta);
  if (metaError) return json({ ok: false, error: metaError }, 400);

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return json({ ok: false, error: "file_wajib_ada" }, 400);
  }

  const validation = await validateUploadFile(file);
  if (!validation.ok) {
    return json({ ok: false, error: validation.error }, 400);
  }

  // Baca file lama dulu (untuk pembersihan setelah sukses).
  const { data: existing } = await supabase
    .from("certificates")
    .select("file_url")
    .eq("id", id)
    .maybeSingle();

  let uploadedPath: string | null = null;

  try {
    const { path, error } = await uploadCertificateFile(
      supabase,
      user.id,
      file,
      validation.ext!,
      validation.mime!
    );
    if (error || !path) {
      return json({ ok: false, error: error ?? "upload_gagal" }, 400);
    }
    uploadedPath = path;

    const { error: updateError } = await supabase
      .from("certificates")
      .update({
        title: meta.title.trim(),
        issuer: meta.issuer.trim(),
        issue_date: meta.issueDate,
        expiry_date: meta.expiryDate,
        category: meta.category,
        is_featured: meta.isFeatured,
        short_description_id: meta.shortDescriptionId,
        short_description_en: meta.shortDescriptionEn,
        credential_url: meta.credentialUrl,
        verification_url: meta.verificationUrl,
        skills: meta.skills,
        file_url: path,
      })
      .eq("id", id);

    if (updateError) {
      // ROLLBACK file baru; file lama dibiarkan utuh.
      console.error("[upload] UPDATE gagal, rollback file baru:", updateError.message);
      await removeCertificateFile(supabase, uploadedPath);
      uploadedPath = null;
      return json({ ok: false, error: updateError.message }, 403);
    }

    // UPDATE sukses -> file lama boleh dihapus (jika memang ada & beda path).
    if (existing?.file_url && existing.file_url !== path) {
      await removeCertificateFile(supabase, existing.file_url);
    }

    return json({ ok: true, path }, 200);
  } catch (err) {
    if (uploadedPath) {
      await removeCertificateFile(supabase, uploadedPath);
    }
    console.error("[upload] Error tak terduga:", err);
    return json({ ok: false, error: "internal_error" }, 500);
  }
}
