import type { APIContext } from "astro";
import { getSupabaseFromLocals, json } from "../../../lib/api";
import { canManageCv } from "../../../lib/auth";
import { adminMutationGuard } from "../../../lib/rateLimit";
import { removeCvFile, uploadCvFile, validateCvFile, type CvLocale } from "../../../lib/storage";

export const prerender = false;

function parseLocale(value: FormDataEntryValue | null): CvLocale | null {
  return value === "id" || value === "en" ? value : null;
}

/**
 * Upload (atau ganti) file CV untuk satu bahasa.
 *
 * Alur keamanan:
 * 1. Guard: session valid + role admin (canManageCv).
 * 2. Validasi server-side: PDF saja (magic bytes %PDF) + maks 5 MB.
 * 3. Upload ke bucket publik `cv` dengan path STABIL `cv-<locale>.pdf`
 *    (upsert) — URL publik tidak berubah, selalu serve file terbaru.
 * 4. Upsert metadata ke tabel cv_files.
 * 5. Jika upsert GAGAL setelah upload sukses -> file di Storage dihapus
 *    (rollback) agar tidak menjadi orphan file.
 */
export async function POST({ request, locals }: APIContext) {
  const supabase = getSupabaseFromLocals(locals);

  if (!supabase) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }

  const { user, profile } = locals;

  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  if (!canManageCv(profile)) {
    return json({ ok: false, error: "forbidden_role" }, 403);
  }

  const mutationDecision = await adminMutationGuard.check(user.id);
  if (mutationDecision.reason === "kv_unavailable") {
    // FAIL-CLOSED: KV limiter tidak terjangkau -> tolak, jangan proses tanpa proteksi.
    return json({ ok: false, error: "service_unavailable" }, 503);
  }
  if (!mutationDecision.allowed) {
    return json({ ok: false, error: "too_many_requests" }, 429);
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) return json({ ok: false, error: "invalid_multipart" }, 400);

  const locale = parseLocale(formData.get("locale"));
  if (!locale) return json({ ok: false, error: "locale_invalid" }, 400);

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return json({ ok: false, error: "file_wajib_ada" }, 400);
  }

  // ===== Validasi server-side (PDF + magic bytes) =====
  const validation = await validateCvFile(file);
  if (!validation.ok) {
    return json({ ok: false, error: validation.error }, 400);
  }

  let uploaded = false;

  try {
    // ===== Upload (path stabil, upsert) =====
    const { path, error } = await uploadCvFile(supabase, locale, file, validation.mime!);
    if (error || !path) {
      return json({ ok: false, error: error ?? "upload_gagal" }, 400);
    }
    uploaded = true;

    // ===== Upsert metadata ke cv_files =====
    const { error: upsertError } = await supabase.from("cv_files").upsert(
      {
        locale,
        file_path: path,
        file_name: file.name,
        size_bytes: file.size,
        mime: validation.mime!,
        uploaded_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "locale" }
    );

    if (upsertError) {
      // ===== ROLLBACK: upload sukses tapi DB gagal -> hapus file =====
      console.error("[cv] upsert gagal, rollback file:", upsertError.message);
      await removeCvFile(supabase, locale);
      uploaded = false;
      return json({ ok: false, error: "db_operation_failed" }, 403);
    }

    return json({ ok: true, path }, 200);
  } catch (err) {
    if (uploaded) {
      await removeCvFile(supabase, locale);
    }
    console.error("[cv] Error tak terduga:", err);
    return json({ ok: false, error: "internal_error" }, 500);
  }
}

/**
 * Hapus file CV untuk satu bahasa (kembali ke fallback statis
 * `public/cv-<locale>.pdf`). Admin saja.
 */
export async function DELETE({ request, locals }: APIContext) {
  const supabase = getSupabaseFromLocals(locals);

  if (!supabase) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }

  const { user, profile } = locals;

  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  if (!canManageCv(profile)) {
    return json({ ok: false, error: "forbidden_role" }, 403);
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
  const locale = parseLocale(url.searchParams.get("locale"));
  if (!locale) return json({ ok: false, error: "locale_invalid" }, 400);

  try {
    const { error } = await supabase.from("cv_files").delete().eq("locale", locale);
    if (error) {
      console.error("[cv] DELETE gagal:", error.message);
      return json({ ok: false, error: "db_operation_failed" }, 403);
    }

    await removeCvFile(supabase, locale);

    return json({ ok: true }, 200);
  } catch (err) {
    console.error("[cv] Error tak terduga:", err);
    return json({ ok: false, error: "internal_error" }, 500);
  }
}
