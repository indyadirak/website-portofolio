import type { APIContext } from "astro";
import { createDecipheriv, timingSafeEqual } from "node:crypto";
import { env } from "cloudflare:workers";
import { json } from "../../lib/api";

export const prerender = false;

/**
 * Endpoint KHUSUS untuk GitHub Actions (db-backup.yml) mengambil
 * konfigurasi Google Drive yang disimpan admin lewat GUI.
 *
 * KEAMANAN:
 *   - HANYA method POST; tidak ada cache (Cache-Control: no-store).
 *   - Gate: header `Authorization: Bearer <BACKUP_FETCH_TOKEN>` — dibandingkan
 *     dengan runtime secret Worker memakai timingSafeEqual (anti timing attack).
 *     Nilai token sama di GitHub secrets.BACKUP_FETCH_TOKEN & worker secret.
 *   - Baca Supabase memakai SUPABASE_SERVICE_ROLE_KEY (server-side only,
 *     bypass RLS — aman karena endpoint ini sendiri di-gate token).
 *   - Key di-DEKripsi AES-256-GCM (GDRIVE_CONFIG_ENCRYPTION_SECRET) lalu
 *     dikirim ke workflow dalam bentuk base64 satu baris (aman untuk env).
 *   - Error handling tidak pernah me-log token/key.
 */

function tokenMatches(expected: string | undefined, provided: string | null): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function decryptKey(secret: string, stored: string): string | null {
  if (!stored.startsWith("enc:")) {
    // Legacy/dev: plaintext di DB (hanya bila secret enkripsi belum di-set).
    return stored;
  }
  try {
    const [, ivB64, tagB64, ctB64] = stored.split(":");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(secret, "utf8"),
      Buffer.from(ivB64 ?? "", "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64 ?? "", "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64 ?? "", "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export async function POST({ request }: APIContext) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const auth = request.headers.get("authorization") ?? "";
  if (!tokenMatches(env.BACKUP_FETCH_TOKEN, auth.startsWith("Bearer ") ? auth.slice(7) : null)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: "not_configured" }, 503);
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/backup_config?id=eq.1&select=gdrive_service_account_key,gdrive_folder_id`,
      {
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      console.error(`[backup-config-fetch] PostgREST HTTP ${res.status}`);
      return json({ ok: false, error: "fetch_failed" }, 502);
    }

    const rows = (await res.json()) as Array<{
      gdrive_service_account_key: string | null;
      gdrive_folder_id: string | null;
    }>;
    const row = rows[0];

    if (!row || !row.gdrive_folder_id || !row.gdrive_service_account_key) {
      return json({ ok: true, configured: false });
    }

    const encSecret = env.GDRIVE_CONFIG_ENCRYPTION_SECRET;
    const plainKey = encSecret ? decryptKey(encSecret, row.gdrive_service_account_key) : row.gdrive_service_account_key;
    if (!plainKey) {
      console.error("[backup-config-fetch] dekripsi key gagal (secret berubah?)");
      return json({ ok: false, error: "decrypt_failed" }, 502);
    }

    return json(
      {
        ok: true,
        configured: true,
        gdriveFolderId: row.gdrive_folder_id,
        // base64 satu baris — aman dibawa via env pada workflow runner.
        gdriveServiceAccountKey: Buffer.from(plainKey, "utf8").toString("base64"),
      },
      200
    );
  } catch (err) {
    console.error(`[backup-config-fetch] error: ${err instanceof Error ? err.message : "unknown"}`);
    return json({ ok: false, error: "fetch_failed" }, 502);
  }
}
