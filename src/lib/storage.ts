import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/** Bucket privat untuk file sertifikat (lihat supabase/storage.sql). */
export const CERTIFICATE_BUCKET = "certificates";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

interface AllowedFileType {
  mime: string;
  extensions: string[];
  /** Pemeriksaan magic bytes pada 16 byte pertama file. */
  match: (head: Uint8Array) => boolean;
}

const bytes = (...values: number[]) => (head: Uint8Array) =>
  values.every((b, i) => head[i] === b);

export const ALLOWED_FILE_TYPES: AllowedFileType[] = [
  // %PDF
  { mime: "application/pdf", extensions: ["pdf"], match: bytes(0x25, 0x50, 0x44, 0x46) },
  // \x89PNG\r\n\x1a\n
  { mime: "image/png", extensions: ["png"], match: bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) },
  // \xFF\xD8\xFF
  { mime: "image/jpeg", extensions: ["jpg", "jpeg"], match: bytes(0xff, 0xd8, 0xff) },
  // GIF87a / GIF89a
  { mime: "image/gif", extensions: ["gif"], match: (h) => ["GIF87a", "GIF89a"].some((sig) => sig === String.fromCharCode(...h.slice(0, 6))) },
  // RIFF....WEBP
  {
    mime: "image/webp",
    extensions: ["webp"],
    match: (h) => h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46 && String.fromCharCode(h[8], h[9], h[10], h[11]) === "WEBP",
  },
];

export interface FileValidationResult {
  ok: boolean;
  error?: string;
  mime?: string;
  ext?: string;
}

/**
 * Validasi file DI SISI SERVER:
 * 1. Ukuran <= 5 MB.
 * 2. MIME type yang dideklarasikan (header) harus ada di allowlist.
 * 3. Magic bytes file harus cocok dengan MIME yang dideklarasikan
 *    (anti-spoofing: header bisa dipalsukan, isi file tidak).
 */
export async function validateUploadFile(file: File): Promise<FileValidationResult> {
  if (file.size <= 0) {
    return { ok: false, error: "file_kosong" };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "file_terlalu_besar_maksimal_5mb" };
  }

  const declared = ALLOWED_FILE_TYPES.find((t) => t.mime === file.type);
  if (!declared) {
    return { ok: false, error: "mime_type_tidak_diizinkan" };
  }

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!declared.match(head)) {
    return { ok: false, error: "mime_tidak_sesuai_isi_file" };
  }

  return { ok: true, mime: declared.mime, ext: declared.extensions[0] };
}

/**
 * Upload file ke Storage dengan path acak (tidak memakai nama asli user,
 * mencegah path traversal / filename injection).
 * Path: <userId>/<uuid>.<ext>
 */
export async function uploadCertificateFile(
  supabase: SupabaseClient<Database>,
  userId: string,
  file: File,
  ext: string,
  mime: string
): Promise<{ path: string | null; error: string | null }> {
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { data, error } = await supabase.storage
    .from(CERTIFICATE_BUCKET)
    .upload(path, file, { contentType: mime, cacheControl: "3600", upsert: false });

  if (error) {
    console.error("[storage] Upload gagal:", error.message);
    return { path: null, error: error.message };
  }

  return { path: data.path, error: null };
}

/**
 * Menghapus file dari Storage. Best-effort: error dicatat, tidak dilempar —
 * karena pemanggil (rollback) tetap harus bisa melanjutkan.
 */
export async function removeCertificateFile(
  supabase: SupabaseClient<Database>,
  path: string | null
): Promise<void> {
  if (!path) return;

  const { error } = await supabase.storage.from(CERTIFICATE_BUCKET).remove([path]);

  if (error) {
    console.error("[storage] Gagal menghapus file (mungkin orphan):", error.message);
  }
}
