import { env } from "cloudflare:workers";

/**
 * =====================================================================
 * CONTENT-DEPLOY TRIGGER — rebuild otomatis setelah mutasi konten CMS.
 *
 * Halaman publik (/, /projects, /certificates, ...) di-prerender saat
 * build, sehingga project/sertifikat/write-up baru TIDAK muncul sampai
 * deploy berikutnya. Helper ini memicu workflow GitHub Actions
 * "Deploy to Cloudflare Workers" via workflow_dispatch API setiap ada
 * perubahan konten — admin tidak perlu push commit kosong manual.
 *
 * Pengaman:
 *   - Cooldown 10 menit via KV (edit 10 item beruntun = 1 deploy, bukan 10).
 *   - Token PAT (actions:write) TIDAK pernah dikembalikan ke klien.
 *   - Helper TIDAK PERNAH melempar: gagal trigger = log server saja,
 *     mutasi CMS tetap sukses (konten tersimpan, deploy bisa manual).
 * =====================================================================
 */

/** Jeda minimum antar trigger deploy otomatis (anti spam CI). */
export const DEPLOY_TRIGGER_COOLDOWN_MS = 10 * 60 * 1000;

const DEPLOY_LAST_KEY = "deploy:last-trigger";

export type DeployTriggerStatus = "triggered" | "cooldown" | "unavailable";

export interface DeployTriggerResult {
  status: DeployTriggerStatus;
  /** Sisa detik cooldown (hanya saat status = "cooldown"). */
  retryAfterSec?: number;
  /** Alasan non-teknis saat status = "unavailable" (aman untuk klien). */
  reason?: "deploy_token_missing" | "deploy_trigger_failed";
}

function repoFullName(): string {
  return env.GITHUB_REPO?.trim() || "indyadirak/website-portofolio";
}

/**
 * Minta rebuild production via GitHub workflow_dispatch.
 * Idempotent + cooldown: aman dipanggil setiap ada mutasi konten.
 */
export async function requestSiteDeploy(source: string): Promise<DeployTriggerResult> {
  // Nama secret GitHub: CMS_DEPLOY_TOKEN (prefix GITHUB_ dilarang GitHub
  // untuk Actions secrets; nama Worker secret disamakan agar konsisten).
  const token = env.CMS_DEPLOY_TOKEN;
  if (!token) {
    console.warn(
      `[deploy-trigger] (${source}) CMS_DEPLOY_TOKEN belum di-set — ` +
        "konten tersimpan, tapi rebuild otomatis dilewati. " +
        "Lihat docs/DEPLOYMENT.md §10."
    );
    return { status: "unavailable", reason: "deploy_token_missing" };
  }

  const now = Date.now();
  const kv = env.RATE_LIMIT_KV;

  try {
    if (kv) {
      const lastRaw = await kv.get(DEPLOY_LAST_KEY);
      const last = lastRaw ? Number(lastRaw) : 0;
      if (Number.isFinite(last) && now - last < DEPLOY_TRIGGER_COOLDOWN_MS) {
        return {
          status: "cooldown",
          retryAfterSec: Math.ceil((last + DEPLOY_TRIGGER_COOLDOWN_MS - now) / 1000),
        };
      }
    } else if (!import.meta.env.DEV) {
      console.warn(
        "[deploy-trigger] RATE_LIMIT_KV tidak tersedia — cooldown dilewati (fail-open, actor = admin terautentikasi)."
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(
        `https://api.github.com/repos/${repoFullName()}/actions/workflows/deploy.yml/dispatches`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "website-portofolio-deploy-trigger",
          },
          body: JSON.stringify({ ref: "main" }),
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // GitHub menjawab 204 No Content saat dispatch diterima.
    if (res.status !== 204) {
      console.error(
        `[deploy-trigger] (${source}) GitHub menolak dispatch: HTTP ${res.status}`
      );
      return { status: "unavailable", reason: "deploy_trigger_failed" };
    }

    if (kv) {
      try {
        await kv.put(DEPLOY_LAST_KEY, String(now), {
          expirationTtl: Math.ceil(DEPLOY_TRIGGER_COOLDOWN_MS / 1000) + 60,
        });
      } catch (err) {
        console.error("[deploy-trigger] KV write gagal (deploy tetap jalan):", err);
      }
    }

    console.log(`[deploy-trigger] (${source}) workflow Deploy diminta — rebuild berjalan ~3 menit.`);
    return { status: "triggered" };
  } catch (err) {
    console.error(`[deploy-trigger] (${source}) exception:`, err);
    return { status: "unavailable", reason: "deploy_trigger_failed" };
  }
}

/**
 * Hook pasca-mutasi — dipanggil SETELAH mutasi CMS sukses.
 * Tidak pernah melempar dan tidak mengubah hasil mutasi.
 */
export async function notifyContentPublished(source: string): Promise<void> {
  try {
    await requestSiteDeploy(source);
  } catch (err) {
    console.error(`[deploy-trigger] (${source}) hook gagal:`, err);
  }
}
