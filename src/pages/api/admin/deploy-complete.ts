import type { APIContext } from "astro";
import { timingSafeEqual } from "node:crypto";
import { env } from "cloudflare:workers";
import { json } from "../../../lib/api";
import { clearDeployDirty } from "../../../lib/deploy";

export const prerender = false;

/**
 * Callback pasca-deploy sukses — dipanggil step TERAKHIR deploy.yml
 * (bukan browser, tanpa session).
 *
 *   POST /api/admin/deploy-complete  {gen?: string}
 *
 * Auth: header `Authorization: Bearer <CMS_DEPLOY_TOKEN>` dibandingkan
 * timing-safe dengan runtime secret Worker; selain itu 401. Secret yang
 * sama di-set ke Worker oleh deploy.yml ("Set CMS_DEPLOY_TOKEN secret").
 *
 * Logika clear (anti race):
 *   - tidak ada dirty state        -> {ok:true, cleared:false}
 *   - gen diberikan & beda dari
 *     gen tersimpan (ada mutasi
 *     baru saat deploy berjalan)   -> {ok:true, cleared:false}
 *   - selain itu (cocok / gen
 *     kosong dari trigger push)    -> hapus key, {ok:true, cleared:true}
 *
 * CATATAN race kecil: trigger `push` tidak membawa inputs.gen sehingga
 * clear-nya unconditional — mutasi yang masuk di sela deploy ikut
 * ter-clear. Risiko diterima: push ke main selalu rebuild penuh dari
 * HEAD terbaru, jadi kontennya ikut ter-deploy.
 */

function tokenMatches(expected: string | undefined, provided: string | null): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST({ request }: APIContext) {
  const header = request.headers.get("Authorization");
  const provided =
    header?.startsWith("Bearer ") && header.slice(7).trim() !== ""
      ? header.slice(7).trim()
      : null;
  if (!tokenMatches(env.CMS_DEPLOY_TOKEN, provided)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const body = (await request.json().catch(() => null)) as { gen?: unknown } | null;
  const gen = typeof body?.gen === "string" ? body.gen : undefined;
  const cleared = await clearDeployDirty(gen);
  return json({ ok: true, cleared });
}

export async function GET() {
  return json({ ok: false, error: "method_not_allowed" }, 405);
}
