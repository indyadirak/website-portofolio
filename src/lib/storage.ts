import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/** Bucket privat untuk file sertifikat (lihat supabase/storage.sql). */
export const CERTIFICATE_BUCKET = "certificates";

/** Bucket publik untuk file CV (lihat supabase/cv.sql). */
export const CV_BUCKET = "cv";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

// ---------------------------------------------------------------------------
// Anti path traversal (FASE 1, TUGAS 1.2)
//
// Path Supabase Storage adalah OBJECT path, bukan filesystem path — jadi
// path.resolve TIDAK aplikabel. Proteksi yang benar = penolakan segment
// berbahaya + allowlist pola (strict shape) untuk path yang kita bangun.
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shape sah untuk path file sertifikat: <userId-uuid>/<random-uuid>.<ext>. */
const CERT_PATH_RE = new RegExp(
  `^${UUID_RE.source}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(pdf|png|jpe?g|gif|webp)$`,
  "i"
);

/**
 * Cek keamanan path object storage (dipakai untuk path yang berasal dari
 * luar, mis. kolom file_url di DB). Menolak: null byte, backslash, path
 * absolut, dan segment ".." / "." / kosong. Return false = path tidak
 * pernah dikirim ke Storage API (fail-closed).
 */
export function isSafeStoragePath(path: string): boolean {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) return false;
  if (path.includes("\0") || path.includes("\\") || path.startsWith("/")) return false;
  return path.split("/").every((seg) => seg.length > 0 && seg !== "." && seg !== "..");
}

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
  // userId harus UUID autentik (dari sesi terverifikasi) — tolak nilai lain
  // agar path tidak bisa dimanipulasi menjadi traversal/injection.
  if (!UUID_RE.test(userId)) {
    console.error("[storage] userId tidak valid untuk path storage");
    return { path: null, error: "invalid_path" };
  }

  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  // Double-safety: hasil akhir WAJIB match shape <uuid>/<uuid>.<ext>.
  if (!CERT_PATH_RE.test(path)) {
    console.error("[storage] path hasil build tidak sesuai shape yang diizinkan");
    return { path: null, error: "invalid_path" };
  }

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

  // Path berasal dari kolom DB (file_url) — validasi dulu agar nilai
  // anomali tidak pernah sampai ke Storage API. Skip (best-effort) bila
  // tidak aman, jangan dilempar.
  if (!isSafeStoragePath(path)) {
    console.error("[storage] Path tidak aman, lewati hapus (mungkin orphan):", path);
    return;
  }

  const { error } = await supabase.storage.from(CERTIFICATE_BUCKET).remove([path]);

  if (error) {
    console.error("[storage] Gagal menghapus file (mungkin orphan):", error.message);
  }
}

// ---------------------------------------------------------------------------
// CV / Resume files (bucket publik `cv`, PDF saja)
// ---------------------------------------------------------------------------

export type CvLocale = "id" | "en";

/** Path stabil di storage per bahasa — nama tetap agar URL publik tidak berubah. */
export function cvStoragePath(locale: CvLocale): string {
  // Runtime guard (bukan hanya TS type): fail-closed bila nilai anomali
  // lolos ke sini, agar path tidak bisa menjadi traversal.
  if (locale !== "id" && locale !== "en") {
    throw new Error("locale CV tidak valid");
  }
  return `cv-${locale}.pdf`;
}

/**
 * Validasi file CV DI SISI SERVER: PDF saja (magic bytes %PDF), maks 5 MB.
 * CV tidak boleh non-PDF (misal gambar) — format CV standar adalah PDF.
 */
export async function validateCvFile(file: File): Promise<FileValidationResult> {
  if (file.size <= 0) {
    return { ok: false, error: "file_kosong" };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "file_terlalu_besar_maksimal_5mb" };
  }

  const pdf = ALLOWED_FILE_TYPES.find((t) => t.mime === "application/pdf");
  if (file.type !== pdf?.mime) {
    return { ok: false, error: "cv_harus_pdf" };
  }

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!pdf!.match(head)) {
    return { ok: false, error: "mime_tidak_sesuai_isi_file" };
  }

  return { ok: true, mime: pdf!.mime, ext: "pdf" };
}

/**
 * Upload (atau ganti) file CV ke bucket publik `cv`.
 * Path tetap `cv-<locale>.pdf` + upsert — URL publik tidak berubah saat
 * admin mengganti CV (cache busting via ?v= di resolveCvUrl).
 */
export async function uploadCvFile(
  supabase: SupabaseClient<Database>,
  locale: CvLocale,
  file: File,
  mime: string
): Promise<{ path: string | null; error: string | null }> {
  let path: string;
  try {
    path = cvStoragePath(locale);
  } catch (err) {
    console.error("[storage] Path CV tidak valid:", err instanceof Error ? err.message : "unknown");
    return { path: null, error: "invalid_path" };
  }

  const { data, error } = await supabase.storage
    .from(CV_BUCKET)
    .upload(path, file, { contentType: mime, cacheControl: "no-cache", upsert: true });

  if (error) {
    console.error("[storage] Upload CV gagal:", error.message);
    return { path: null, error: error.message };
  }

  return { path: data.path, error: null };
}

/** Menghapus file CV dari bucket (best-effort). */
export async function removeCvFile(
  supabase: SupabaseClient<Database>,
  locale: CvLocale
): Promise<void> {
  const { error } = await supabase.storage.from(CV_BUCKET).remove([cvStoragePath(locale)]);

  if (error) {
    console.error("[storage] Gagal menghapus CV (mungkin orphan):", error.message);
  }
}

// ---------------------------------------------------------------------------
// File sertifikat eksternal (Google Drive) — hemat storage bucket.
// ---------------------------------------------------------------------------

/** URL file eksternal penuh (bukan path bucket internal). */
export function isExternalFileUrl(value: string): boolean {
  return /^https:\/\//i.test(value);
}

const DRIVE_ID = "[A-Za-z0-9_-]{10,120}";
const DRIVE_PATTERNS: RegExp[] = [
  // https://drive.google.com/file/d/<id>/view (± params)
  new RegExp(`^https://drive\\.google\\.com/file/d/(${DRIVE_ID})/(?:view|edit)?(?:\\?.*)?$`, "i"),
  // https://drive.google.com/uc?export=download&id=<id> | open?id=<id>
  new RegExp(`^https://drive\\.google\\.com/(?:uc|open)\\?(?:.*&)?id=(${DRIVE_ID})(?:&.*)?$`, "i"),
  // https://drive.google.com/thumbnail?id=<id>
  new RegExp(`^https://drive\\.google\\.com/thumbnail\\?(?:.*&)?id=(${DRIVE_ID})(?:&.*)?$`, "i"),
];

/**
 * Validasi share-link Google Drive dan normalisasi menjadi tautan
 * direct-download seragam: https://drive.google.com/uc?export=download&id=<id>
 * Return null bila bukan link Drive yang dikenali (hindari SSRF/redirect
 * ke host sembarang via kolom file_url).
 */
export function normalizeDriveFileUrl(raw: string): string | null {
  const value = raw.trim();
  for (const pattern of DRIVE_PATTERNS) {
    const match = value.match(pattern);
    if (match) {
      return `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
  }
  return null;
}

/** true bila nilai adalah URL file Drive yang sudah ternormalisasi. */
export function isNormalizedDriveUrl(value: string): boolean {
  return /^https:\/\/drive\.google\.com\/uc\?export=download&id=[A-Za-z0-9_-]{10,120}$/.test(value);
}
