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
//   GDRIVE_SERVICE_ACCOUNT_KEY  (wajib)  JSON key Service Account, base64-encoded
//   GDRIVE_BACKUP_FOLDER_ID     (wajib)  ID folder Drive tujuan
//   BACKUP_FILE                 (ops)    file yang di-upload (default backup.sql.gpg)
//   DRIVE_RETENTION_WEEKS       (ops)    jumlah minggu retention (default 12)
//
// JANGAN pernah console.log isi JSON key / secret apapun — log hanya id/name.

import { createReadStream } from "node:fs";
import { google } from "googleapis";

const SCOPE = ["https://www.googleapis.com/auth/drive.file"];
const BACKUP_PREFIX = "backup-";

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const keyB64 = process.env.GDRIVE_SERVICE_ACCOUNT_KEY;
  const folderId = process.env.GDRIVE_BACKUP_FOLDER_ID;

  if (!keyB64 || !folderId) {
    console.warn(
      "[gdrive] GDRIVE_SERVICE_ACCOUNT_KEY / GDRIVE_BACKUP_FOLDER_ID kosong — step Drive di-skip (artifact GitHub tetap tersimpan)."
    );
    return;
  }

  const retentionWeeks = Number(process.env.DRIVE_RETENTION_WEEKS ?? 12);
  const backupFile = process.env.BACKUP_FILE ?? "backup.sql.gpg";
  const retentionMs = retentionWeeks * 7 * 24 * 60 * 60 * 1000;

  const credentials = JSON.parse(Buffer.from(keyB64, "base64").toString("utf8"));
  const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPE });
  const drive = google.drive({ version: "v3", auth });

  // 1. Upload (nama ber-timestamp: backup-2026-08-08.sql.gpg)
  const name = `${BACKUP_PREFIX}${today()}.sql.gpg`;
  const created = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType: "application/octet-stream", body: createReadStream(backupFile) },
    fields: "id,name",
  });
  console.log(`[gdrive] upload OK: ${created.data.name} (id ${created.data.id})`);

  // 2. Retention — hapus backup-* yang lebih tua dari retentionWeeks.
  const cutoffMs = Date.now() - retentionMs;
  const listed = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
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
