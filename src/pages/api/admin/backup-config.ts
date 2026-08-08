import type { APIContext } from "astro";
import { createCipheriv, randomBytes } from "node:crypto";
import { env } from "cloudflare:workers";
import { json } from "../../../lib/api";
import { hasRole, resolveMfaStatus } from "../../../lib/auth";

export const prerender = false;

/**
 * Kelola konfigurasi Google Drive backup (prinsip 3-2-1) dari GUI admin.
 *
 * - POST   : simpan/update JSON key Service Account + folder ID Drive.
 * - DELETE : hapus konfigurasi (unlink).
 *
 * KEAMANAN (berlapis):
 *   1. Middleware SSR memvalidasi sesi cookie; di sini di-guard ulang
 *      (user harus login).
 *   2. Role: HANYA admin (profiles.role = 'admin') + MFA aal2 — cek
 *      server-side SEKALIGUS ditegakkan lagi oleh RLS di Supabase
 *      (policy backup_config_*_mfa_admin).
 *   3. Anti-CSRF: request browser harus same-origin (cek Origin /
 *      Sec-Fetch-Site); tanpa header tsb (mis. curl) tetap wajib cookie.
 *   4. At-rest: JSON key DIENKRIPSI AES-256-GCM dengan secret runtime
 *      GDRIVE_CONFIG_ENCRYPTION_SECRET sebelum masuk DB — kalau DB
 *      bocor, key tidak bisa langsung dipakai. Tanpa secret (dev),
 *      disimpan plaintext + warning di log (bukan jalan produksi).
 *   5. Key TIDAK pernah dikembalikan/di-echo ke klien.
 */

function parseSaKey(raw: string): {
  client_email: string;
} | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      parsed.type !== "service_account" ||
      typeof parsed.client_email !== "string" ||
      typeof parsed.private_key !== "string" ||
      parsed.private_key.length < 16
    ) {
      return null;
    }
    return { client_email: parsed.client_email };
  } catch {
    return null;
  }
}

function encryptKey(secret: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(secret, "utf8"), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Validasi request browser same-origin (anti-CSRF ringan di atas cookie). */
function isSameOrigin(request: Request): boolean {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return false;
  }
  return true;
}

export async function POST({ request, locals }: APIContext) {
  if (!isSameOrigin(request)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const { user, profile, supabase } = locals;
  if (!user || !supabase || !profile) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!hasRole(profile, "admin")) {
    return json({ ok: false, error: "forbidden" }, 403);
  }
  const { currentLevel } = await resolveMfaStatus(supabase, user.id);
  if (currentLevel !== "aal2") {
    return json({ ok: false, error: "mfa_required" }, 403);
  }

  let body: { gdriveServiceAccountKey?: string; gdriveFolderId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const folderId = body.gdriveFolderId?.trim() ?? "";
  const rawKey = body.gdriveServiceAccountKey?.trim() ?? "";

  if (!rawKey && !folderId) {
    return json({ ok: false, error: "tidak_ada_data" }, 400);
  }
  if (folderId && (folderId.length < 3 || folderId.length > 256 || /[\s/]/.test(folderId))) {
    return json({ ok: false, error: "folder_id_invalid" }, 400);
  }

  let storedKey: string | null = null;
  if (rawKey) {
    const parsed = parseSaKey(rawKey);
    if (!parsed) {
      return json({ ok: false, error: "sa_key_invalid" }, 400);
    }
    const encSecret = env.GDRIVE_CONFIG_ENCRYPTION_SECRET;
    if (encSecret) {
      storedKey = encryptKey(encSecret, rawKey);
    } else {
      console.warn(
        "[backup-config] GDRIVE_CONFIG_ENCRYPTION_SECRET belum di-set — key disimpan PLAINTEXT (dev mode). Set secret via deploy.yml."
      );
      storedKey = rawKey;
    }
  }

  const { error } = await supabase
    .from("backup_config")
    .upsert(
      {
        id: 1,
        ...(storedKey !== null ? { gdrive_service_account_key: storedKey } : {}),
        ...(folderId ? { gdrive_folder_id: folderId } : {}),
        updated_by: user.email ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (error) {
    console.error("[backup-config] upsert gagal:", error.message);
    return json({ ok: false, error: "simpan_gagal" }, 500);
  }

  return json({ ok: true });
}

export async function DELETE({ request, locals }: APIContext) {
  if (!isSameOrigin(request)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const { user, profile, supabase } = locals;
  if (!user || !supabase || !profile) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!hasRole(profile, "admin")) {
    return json({ ok: false, error: "forbidden" }, 403);
  }
  const { currentLevel } = await resolveMfaStatus(supabase, user.id);
  if (currentLevel !== "aal2") {
    return json({ ok: false, error: "mfa_required" }, 403);
  }

  const { error } = await supabase.from("backup_config").delete().eq("id", 1);
  if (error) {
    console.error("[backup-config] delete gagal:", error.message);
    return json({ ok: false, error: "hapus_gagal" }, 500);
  }

  return json({ ok: true });
}
