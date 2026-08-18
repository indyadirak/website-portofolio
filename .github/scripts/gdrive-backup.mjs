// Google Drive backup offload (3-2-1 backup) — salinan KEDUA dari artifact.
//
// - Upload file .gpg ke folder Drive yang di-share ke Service Account.
// - Retention: hapus file backup-* di folder itu yang lebih tua dari
//   DRIVE_RETENTION_WEEKS minggu (default 12) supaya tidak menumpuk.
// - Scope "drive.file": Service Account hanya bisa melihat/mengelola file
//   yang DIBUAT oleh akun ini (bukan seluruh Drive user).
// - NON-FATAL: semua error ditangkap di main().catch() dan hanya di-set
//   exitCode = 1 — workflow memakai continue-on-error, jadi kegagalan
//   upload Drive TIDAK menggagalkan job (artifact GitHub tetap salinan utama).
//
// Env:
//   BACKUP_FETCH_URL            (wajib prefer) worker URL (vars.BACKUP_CONFIG_URL) —
//                                konfigurasi diambil dari endpoint /api/backup-config
//   BACKUP_FETCH_TOKEN          (wajib prefer) token gate endpoint (secrets.BACKUP_FETCH_TOKEN)
//   GDRIVE_SERVICE_ACCOUNT_KEY  (fallback legacy) JSON key SA, base64-encoded
//   GDRIVE_BACKUP_FOLDER_ID     (fallback legacy) ID folder Drive tujuan
//   BACKUP_FILE                 (ops)    file yang di-upload (default backup.sql.gpg)
//   DRIVE_RETENTION_WEEKS       (ops)    jumlah minggu retention (default 12)
//
// Prioritas kredensial: (1) BACKUP_FETCH_TOKEN/BACKUP_FETCH_URL (GUI admin),
// (2) GDRIVE_SERVICE_ACCOUNT_KEY/GDRIVE_BACKUP_FOLDER_ID (secret lama manual).
//
// JANGAN pernah console.log isi JSON key / secret apapun — log hanya id/name.

import { createReadStream, existsSync } from "node:fs";
import { google } from "googleapis";

const SCOPE = ["https://www.googleapis.com/auth/drive.file"];
const BACKUP_PREFIX = "backup-";

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Resolusi kredensial Drive: endpoint konfigurasi (GUI admin) lebih diutamakan;
 * bila tidak tersedia, fallback ke env GDRIVE_* (cara lama). Mengembalikan
 * { keyB64, folderId } atau null (tidak dikonfigurasi -> skip tanpa error).
 */
async function resolveCredentials() {
  const fetchUrl = process.env.BACKUP_FETCH_URL;
  const fetchToken = process.env.BACKUP_FETCH_TOKEN;

  if (fetchUrl && fetchToken) {
    const res = await fetch(`${fetchUrl.replace(/\/+$/, "")}/api/backup-config`, {
      method: "POST",
      // Content-Type JSON diperlukan: Astro 7 origin-check (CSRF) menolak
      // POST tanpa Origin BILA tidak ada Content-Type ("Cross-site POST
      // form submissions are forbidden", origin-check.js) — dan request
      // dari runner Node tidak punya Origin. Content-Type non-form
      // (application/json) dilewati origin-check.
      headers: {
        Authorization: `Bearer ${fetchToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (res.status === 503) {
      console.warn("[gdrive] endpoint /api/backup-config belum dikonfigurasi (503) — skip (artifact GitHub tetap tersimpan).");
      return null;
    }
    if (!res.ok) {
      throw new Error(`fetch konfigurasi gagal: HTTP ${res.status}`);
    }

    const cfg = await res.json();
    if (!cfg?.configured || !cfg.gdriveServiceAccountKey || !cfg.gdriveFolderId) {
      console.warn("[gdrive] konfigurasi Drive belum diisi di GUI admin — skip (artifact GitHub tetap tersimpan).");
      return null;
    }
    return { keyB64: cfg.gdriveServiceAccountKey, folderId: cfg.gdriveFolderId };
  }

  const keyB64 = process.env.GDRIVE_SERVICE_ACCOUNT_KEY;
  const folderId = process.env.GDRIVE_BACKUP_FOLDER_ID;
  if (keyB64 && folderId) {
    return { keyB64, folderId };
  }

  console.warn("[gdrive] kredensial belum diset (BACKUP_FETCH_TOKEN/BACKUP_FETCH_URL atau GDRIVE_*) — skip (artifact GitHub tetap tersimpan).");
  return null;
}

async function main() {
  const cred = await resolveCredentials();
  if (!cred) return;

  const retentionWeeks = Number(process.env.DRIVE_RETENTION_WEEKS ?? 12);
  const backupFile = process.env.BACKUP_FILE ?? "backup.sql.gpg";
  const retentionMs = retentionWeeks * 7 * 24 * 60 * 60 * 1000;

  if (!existsSync(backupFile)) {
    throw new Error(`file backup tidak ditemukan: ${backupFile} — pastikan step dump+enkripsi sukses.`);
  }

  const credentials = JSON.parse(Buffer.from(cred.keyB64, "base64").toString("utf8"));
  const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPE });
  const drive = google.drive({ version: "v3", auth });

  // 1. Upload (nama ber-timestamp: backup-2026-08-08.sql.gpg)
  const name = `${BACKUP_PREFIX}${today()}.sql.gpg`;
  const created = await drive.files.create({
    requestBody: { name, parents: [cred.folderId] },
    media: { mimeType: "application/octet-stream", body: createReadStream(backupFile) },
    fields: "id,name",
  });
  console.log(`[gdrive] upload OK: ${created.data.name} (id ${created.data.id})`);

  // 2. Retention — hapus backup-* yang lebih tua dari retentionWeeks.
  const cutoffMs = Date.now() - retentionMs;
  const listed = await drive.files.list({
    q: `'${cred.folderId}' in parents and trashed = false`,
    fields: "files(id,name,createdTime)",
    pageSize: 100,
    orderBy: "createdTime",
  });

  const stale = (listed.data.files ?? []).filter(
    (f) =>
      f.name?.startsWith(BACKUP_PREFIX) &&
      new Date(f.createdTime ?? 0).getTime() < cutoffMs
  );

  for (const f of stale) {
    await drive.files.delete({ fileId: f.id });
    console.log(`[gdrive] retention: hapus file lama ${f.name} (dibuat ${f.createdTime})`);
  }
  console.log(
    `[gdrive] retention selesai: ${stale.length} file dihapus (cutoff ${retentionWeeks} minggu), ${(listed.data.files ?? []).length} file di folder.`
  );
}

main().catch((err) => {
  console.error(`[gdrive] GAGAL (non-fatal): ${err?.message ?? err}`);
  process.exitCode = 1;
});
