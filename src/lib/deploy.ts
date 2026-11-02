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

/**
 * =====================================================================
 * DIRTY FLAG — penanda "ada perubahan CMS yang belum di-publish".
 *
 * Halaman publik di-prerender; trigger deploy otomatis bisa gagal
 * diam-diam (mute failure). Flag ini disimpan di KV yang sama
 * (RATE_LIMIT_KV) sebagai JSON {gen, count, updatedAt}:
 *   - gen: nomor generasi — naik setiap mutasi; dikirim sebagai input
 *     workflow agar callback pasca-deploy hanya menghapus generasi
 *     yang ikut ter-deploy (anti race dengan mutasi baru).
 *   - count: jumlah mutasi sejak clear terakhir (tampil di banner).
 *   - updatedAt: epoch ms mutasi terakhir.
 *
 * Semua fungsi di bawah TIDAK PERNAH melempar (try/catch di dalam):
 * KV bermasalah = banner disembunyikan, mutasi CMS tetap sukses.
 * =====================================================================
 */
const DEPLOY_DIRTY_KEY = "deploy:dirty";

export interface DeployDirtyState {
  dirty: boolean;
  count: number;
  updatedAt: number;
}

interface DeployDirtyRecord {
  gen: number;
  count: number;
  updatedAt: number;
}

async function readDirtyRecord(): Promise<DeployDirtyRecord | null> {
  try {
    const kv = env.RATE_LIMIT_KV;
    if (!kv) return null;
    const raw = await kv.get(DEPLOY_DIRTY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DeployDirtyRecord>;
    if (!Number.isFinite(parsed.gen) || !Number.isFinite(parsed.count)) return null;
    return {
      gen: parsed.gen as number,
      count: parsed.count as number,
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch (err) {
    console.error("[deploy-dirty] baca dirty state gagal:", err);
    return null;
  }
}

/**
 * Tandai situs kotor: gen+1, count+1, updatedAt=now.
 * Dipanggil di dalam notifyContentPublished SEBELUM requestSiteDeploy.
 */
export async function markSiteDirty(): Promise<void> {
  try {
    const kv = env.RATE_LIMIT_KV;
    if (!kv) return;
    const prev = await readDirtyRecord();
    const next: DeployDirtyRecord = {
      gen: (prev?.gen ?? 0) + 1,
      count: (prev?.count ?? 0) + 1,
      updatedAt: Date.now(),
    };
    await kv.put(DEPLOY_DIRTY_KEY, JSON.stringify(next));
  } catch (err) {
    console.error("[deploy-dirty] markSiteDirty gagal (mutasi tetap sukses):", err);
  }
}

/** Baca status dirty untuk banner admin. Tidak pernah throw. */
export async function getDirtyState(): Promise<DeployDirtyState> {
  const rec = await readDirtyRecord();
  if (!rec) return { dirty: false, count: 0, updatedAt: 0 };
  return { dirty: rec.count > 0, count: rec.count, updatedAt: rec.updatedAt };
}

/** Generasi saat ini untuk input workflow ("0" bila tidak ada state). */
async function readDirtyGen(): Promise<string> {
  const rec = await readDirtyRecord();
  return rec ? String(rec.gen) : "0";
}

/**
 * Hapus dirty flag pasca-deploy sukses (dipakai endpoint deploy-complete).
 * gen yang diberikan harus cocok dengan gen tersimpan — bila ada mutasi
 * baru saat deploy berjalan (gen berbeda), flag DIPERTAHANKAN.
 * gen kosong/undefined = clear unconditional (kasus trigger push).
 */
export async function clearDeployDirty(gen?: string): Promise<boolean> {
  try {
    const kv = env.RATE_LIMIT_KV;
    if (!kv) return false;
    const rec = await readDirtyRecord();
    if (!rec) return false;
    if (gen !== undefined && gen !== "" && rec.gen !== Number(gen)) return false;
    await kv.delete(DEPLOY_DIRTY_KEY);
    return true;
  } catch (err) {
    console.error("[deploy-dirty] clear gagal:", err);
    return false;
  }
}

export type DeployTriggerStatus = "triggered" | "cooldown" | "unavailable";

/**
 * =====================================================================
 * DEPLOY RUN STATUS — status live "diminta → berjalan → sukses/gagal".
 *
 * GitHub tidak menyediakan persen progres; yang tersedia adalah state
 * run-nya. Alur state:
 *   - "requested": dispatch workflow_dispatch diterima GitHub (diset di
 *     requestSiteDeploy). run_id belum dikenal.
 *   - "running":   step "Report deploy started" di deploy.yml melapor
 *     balik ke Worker (membawa github.run_id).
 *   - "success":   callback deploy-complete (step terakhir saat sukses).
 *   - "failed":    step "Report deploy failed" (if: failure()).
 *
 * Disimpan di KV yang sama sebagai JSON {state, runId, startedAt,
 * updatedAt}. Semua fungsi TIDAK PERNAH melempar (fail-safe seperti
 * dirty flag): KV bermasalah = status "idle", banner tetap berjalan
 * dengan perilaku lama (tanpa status live).
 * =====================================================================
 */
const DEPLOY_STATUS_KEY = "deploy:status";

/**
 * Generasi dirty-flag yang ikut di-dispatch (disimpan saat trigger manual).
 * Dipakai rekonsiliasi status: saat GitHub melaporkan run sukses, Worker
 * clear dirty flag HANYA untuk generasi ini — mutasi baru selama deploy
 * (gen berbeda) tetap ditandai "belum di-publish".
 */
const DEPLOY_DISPATCH_GEN_KEY = "deploy:dispatch-gen";

export type DeployRunState = "idle" | "requested" | "running" | "success" | "failed";

export interface DeployRunStatus {
  state: DeployRunState;
  /** GitHub Actions run id (null bila belum dikenal, mis. fase requested). */
  runId: string | null;
  startedAt: number;
  updatedAt: number;
}

const DEPLOY_STATUS_IDLE: DeployRunStatus = {
  state: "idle",
  runId: null,
  startedAt: 0,
  updatedAt: 0,
};

function isDeployRunState(v: unknown): v is DeployRunState {
  return (
    v === "idle" ||
    v === "requested" ||
    v === "running" ||
    v === "success" ||
    v === "failed"
  );
}

/** Tulis status run deploy. Tidak pernah throw. */
export async function setDeployStatus(
  state: Exclude<DeployRunState, "idle">,
  runId?: string | null
): Promise<void> {
  try {
    const kv = env.RATE_LIMIT_KV;
    if (!kv) return;
    const prev = await getDeployStatus();
    const now = Date.now();
    // startedAt dipertahankan selama run yang sama (runId cocok) agar
    // durasi yang tampil di banner akurat.
    const sameRun = !!runId && !!prev.runId && runId === prev.runId;
    const next: DeployRunStatus = {
      state,
      runId: runId ?? prev.runId,
      startedAt: sameRun && prev.startedAt ? prev.startedAt : now,
      updatedAt: now,
    };
    await kv.put(DEPLOY_STATUS_KEY, JSON.stringify(next));
  } catch (err) {
    console.error("[deploy-status] setDeployStatus gagal:", err);
  }
}

/** Baca status run deploy untuk banner admin. Tidak pernah throw. */
export async function getDeployStatus(): Promise<DeployRunStatus> {
  try {
    const kv = env.RATE_LIMIT_KV;
    if (!kv) return DEPLOY_STATUS_IDLE;
    const raw = await kv.get(DEPLOY_STATUS_KEY);
    if (!raw) return DEPLOY_STATUS_IDLE;
    const parsed = JSON.parse(raw) as Partial<DeployRunStatus>;
    if (!isDeployRunState(parsed.state)) return DEPLOY_STATUS_IDLE;
    return {
      state: parsed.state,
      runId: typeof parsed.runId === "string" ? parsed.runId : null,
      startedAt: Number(parsed.startedAt) || 0,
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch (err) {
    console.error("[deploy-status] getDeployStatus gagal:", err);
    return DEPLOY_STATUS_IDLE;
  }
}

// =====================================================================
// REKONSILIASI STATUS DENGAN GITHUB ACTIONS
//
// Callback dari workflow (deploy-status / deploy-complete) bisa diblokir
// Cloudflare Bot Fight / WAF sebelum sampai ke Worker — dulu akibatnya
// status nyangkut "running" selamanya dan dirty flag tidak ter-clear.
// Sebagai sumber kebenaran cadangan, Worker membaca status run langsung
// dari GitHub Actions API (token yang sama dipakai untuk dispatch).
//
// Hanya berjalan selama state "requested"/"running" (banner sedang
// polling) sehingga tidak menambah panggilan API saat idle.
// =====================================================================

interface GitHubWorkflowRun {
  id: number;
  /** queued | in_progress | completed | waiting | requested | pending */
  status: string;
  /** success | failure | cancelled | skipped | timed_out | ... (null saat belum selesai) */
  conclusion: string | null;
  created_at: string;
}

const GITHUB_STATUS_UA = "website-portofolio-deploy-status";

async function githubJson<T>(token: string, url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": GITHUB_STATUS_UA,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) {
      console.warn(`[deploy-status] GitHub API HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn("[deploy-status] GitHub API gagal:", err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readDispatchedGen(): Promise<string | undefined> {
  try {
    const kv = env.RATE_LIMIT_KV;
    if (!kv) return undefined;
    return (await kv.get(DEPLOY_DISPATCH_GEN_KEY)) ?? undefined;
  } catch {
    return undefined;
  }
}

async function clearDispatchedGen(): Promise<void> {
  try {
    await env.RATE_LIMIT_KV?.delete(DEPLOY_DISPATCH_GEN_KEY);
  } catch {
    // best-effort
  }
}

/**
 * Sinkronkan status deploy dari GitHub Actions. Tidak pernah throw.
 * Mengembalikan status terbaru (atau status lama bila tidak bisa sync).
 */
export async function syncDeployStatusFromGitHub(): Promise<DeployRunStatus> {
  const current = await getDeployStatus();
  if (current.state !== "requested" && current.state !== "running") return current;

  const token = env.CMS_DEPLOY_TOKEN;
  if (!token) return current;

  const base = `https://api.github.com/repos/${repoFullName()}/actions`;
  let run: GitHubWorkflowRun | null = null;

  if (current.runId) {
    run = await githubJson<GitHubWorkflowRun>(token, `${base}/runs/${current.runId}`);
  }

  if (!run) {
    // run_id belum dikenal (baru "requested") atau API run tunggal gagal —
    // ambil run terbaru, tapi hanya yang dibuat dekat waktu trigger agar
    // tidak salah membaca run lama.
    const list = await githubJson<{ workflow_runs?: GitHubWorkflowRun[] }>(
      token,
      `${base}/workflows/deploy.yml/runs?branch=main&per_page=5`
    );
    const runs = list?.workflow_runs ?? [];
    const since = current.startedAt ? current.startedAt - 2 * 60 * 1000 : 0;
    run = runs.find((r) => Date.parse(r.created_at) >= since) ?? null;
  }

  if (!run) return current;

  const runId = String(run.id);

  if (run.status === "completed") {
    if (run.conclusion === "success") {
      await setDeployStatus("success", runId);
      // Clear hanya generasi yang ikut di-dispatch (mutasi baru di sela
      // deploy tetap ditandai). Sama seperti callback deploy-complete.
      const gen = await readDispatchedGen();
      await clearDeployDirty(gen);
      await clearDispatchedGen();
    } else {
      await setDeployStatus("failed", runId);
      await clearDispatchedGen();
    }
    return getDeployStatus();
  }

  // queued/in_progress — pastikan banner punya run_id untuk link Actions.
  // Hindari tulis KV berulang bila status tidak berubah.
  if (current.runId === runId && current.state === "running") return current;
  await setDeployStatus("running", runId);
  return getDeployStatus();
}

/** URL halaman Actions untuk run tertentu (atau daftar run workflow). */
export function deployActionsUrl(runId: string | null): string {
  const repo = "indyadirak/website-portofolio";
  return runId
    ? `https://github.com/${repo}/actions/runs/${runId}`
    : `https://github.com/${repo}/actions/workflows/deploy.yml`;
}

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
    // Dirty generation dibaca SEBELUM dispatch agar callback pasca-deploy
    // tahu generasi mana yang ikut ter-deploy ("0" = tanpa state).
    const dispatchGen = await readDirtyGen();
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
          body: JSON.stringify({ ref: "main", inputs: { gen: dispatchGen } }),
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
        // Simpan gen yang di-dispatch agar rekonsiliasi status (polling
        // GitHub) bisa clear dirty flag secara aman saat run sukses.
        await kv.put(DEPLOY_DISPATCH_GEN_KEY, dispatchGen, {
          expirationTtl: 6 * 60 * 60,
        });
      } catch (err) {
        console.error("[deploy-trigger] KV write gagal (deploy tetap jalan):", err);
      }
    }

    console.log(`[deploy-trigger] (${source}) workflow Deploy diminta — rebuild berjalan ~3 menit.`);
    // Lapor status "requested" agar banner bisa polling progres live.
    // Fail-safe (tidak pernah throw): tidak boleh menggagalkan trigger.
    await setDeployStatus("requested");
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
    // Single choke point: tandai dirty DULU agar mutasi tercatat walau
    // dispatch deploy-nya gagal/cooldown — banner mengingatkan Publish.
    await markSiteDirty();
    await requestSiteDeploy(source);
  } catch (err) {
    console.error(`[deploy-trigger] (${source}) hook gagal:`, err);
  }
}
