import type { APIContext } from "astro";
import { createDecipheriv, timingSafeEqual } from "node:crypto";
import { env } from "cloudflare:workers";
import { json } from "../../lib/api";
import { backupConfigAttemptGuard } from "../../lib/rateLimit";

export const prerender = false;

/**
 * Endpoint KHUSUS untuk GitHub Actions (db-backup.yml) mengambil
 * konfigurasi Google Drive yang disimpan admin lewat GUI.
 *
 * KEAMANAN:
 *   - HANYA method POST; tidak ada cache (Cache-Control: no-store).
 *   - RATE LIMIT (backupConfigAttemptGuard, RATE_LIMIT_KV): maks 5
 *     percobaan gagal (token salah) per-IP per 10 menit — FAIL-CLOSED:
 *     KV tidak tersedia => 503, request TIDAK diproses. Sukses reset
 *     counter (workflow normal seminggu sekali tidak pernah kena).
 *   - Gate: header `Authorization: Bearer <BACKUP_FETCH_TOKEN>` — dibandingkan
 *     dengan runtime secret Worker memakai timingSafeEqual (anti timing attack).
 *     Nilai token sama di GitHub secrets.BACKUP_FETCH_TOKEN & worker secret.
 *   - Baca Supabase memakai SUPABASE_SERVICE_ROLE_KEY (server-side only,
 *     bypass RLS — aman karena endpoint ini sendiri di-gate token + rate
 *     limit).
 *   - Key di-DEKripsi AES-256-GCM (GDRIVE_CONFIG_ENCRYPTION_SECRET) lalu
 *     dikirim ke workflow dalam bentuk base64 satu baris (aman untuk env).
 *   - AUDIT: setiap percobaan dicatat ke backup_config_access_log
 *     (status success/failed/blocked) — HANYA metadata (IP, user-agent);
 *     token & kredensial TIDAK pernah dicatat/di-log.
 *   - Error handling tidak pernah me-log token/key.
 */

const RETENTION_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

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

/**
 * Catat percobaan akses ke tabel audit (service role). Non-fatal:
 * kegagalan logging TIDAK menggagalkan request. Token/kredensial
 * tidak pernah masuk payload. Sekalian cleanup baris > 90 hari.
 */
async function logAccess(args: {
  supabaseUrl: string;
  serviceRoleKey: string;
  ip: string;
  userAgent: string | null;
  status: "success" | "failed" | "blocked";
  blockedReason?: "rate_limited" | "kv_unavailable";
}): Promise<void> {
  const { supabaseUrl, serviceRoleKey, ip, userAgent, status, blockedReason } = args;
  const headers = {
    apikey: serviceRoleKey,
    "Content-Type": "application/json",
  };

  try {
    await fetch(`${supabaseUrl}/rest/v1/backup_config_access_log`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        ip_address: ip,
        user_agent: userAgent,
        status,
        blocked_reason: blockedReason ?? null,
      }),
    });

    // Cleanup: hapus baris lebih tua dari 90 hari (murah — 1x per akses).
    const cutoff = new Date(Date.now() - RETENTION_DAYS_MS).toISOString();
    await fetch(
      `${supabaseUrl}/rest/v1/backup_config_access_log?attempted_at=lt.${encodeURIComponent(cutoff)}`,
      { method: "DELETE", headers }
    );
  } catch (err) {
    console.error(
      `[backup-config-access] log gagal (non-fatal): ${err instanceof Error ? err.message : "unknown"}`
    );
  }
}

export async function POST({ request }: APIContext) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const userAgent = request.headers.get("user-agent");

  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  // ===== 1. Rate limit (FAIL-CLOSED) — SEBELUM token compare =====
  const decision = await backupConfigAttemptGuard.check(ip);
  if (!decision.allowed) {
    if (decision.reason === "kv_unavailable") {
      // Fail closed: jangan layani endpoint tanpa proteksi. Pesan generik.
      if (supabaseUrl && serviceRoleKey) {
        await logAccess({
          supabaseUrl,
          serviceRoleKey,
          ip,
          userAgent,
          status: "blocked",
          blockedReason: "kv_unavailable",
        });
      }
      return json({ ok: false, error: "service_unavailable" }, 503);
    }
    if (supabaseUrl && serviceRoleKey) {
      await logAccess({
        supabaseUrl,
        serviceRoleKey,
        ip,
        userAgent,
        status: "blocked",
        blockedReason: "rate_limited",
      });
    }
    return json(
      { ok: false, error: "too_many_attempts", retryAfterSec: decision.retryAfterSec ?? 0 },
      429
    );
  }

  // ===== 2. Gate token =====
  const auth = request.headers.get("authorization") ?? "";
  if (!tokenMatches(env.BACKUP_FETCH_TOKEN, auth.startsWith("Bearer ") ? auth.slice(7) : null)) {
    await backupConfigAttemptGuard.recordFailure(ip);
    if (supabaseUrl && serviceRoleKey) {
      await logAccess({
        supabaseUrl,
        serviceRoleKey,
        ip,
        userAgent,
        status: "failed",
      });
    }
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  // Token benar — reset counter (workflow mingguan tidak pernah terblokir).
  await backupConfigAttemptGuard.recordSuccess(ip);

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
      await logAccess({ supabaseUrl, serviceRoleKey, ip, userAgent, status: "success" });
      return json({ ok: true, configured: false });
    }

    const encSecret = env.GDRIVE_CONFIG_ENCRYPTION_SECRET;
    const plainKey = encSecret ? decryptKey(encSecret, row.gdrive_service_account_key) : row.gdrive_service_account_key;
    if (!plainKey) {
      console.error("[backup-config-fetch] dekripsi key gagal (secret berubah?)");
      return json({ ok: false, error: "decrypt_failed" }, 502);
    }

    await logAccess({ supabaseUrl, serviceRoleKey, ip, userAgent, status: "success" });

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
