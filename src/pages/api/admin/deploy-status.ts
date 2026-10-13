import type { APIContext } from "astro";
import { timingSafeEqual } from "node:crypto";
import { env } from "cloudflare:workers";
import { getSupabaseFromLocals, json } from "../../../lib/api";
import { hasRole } from "../../../lib/auth";
import {
  deployActionsUrl,
  getDeployStatus,
  setDeployStatus,
} from "../../../lib/deploy";

export const prerender = false;

function tokenMatches(expected: string | undefined, provided: string | null): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * GET /api/admin/deploy-status — baca status run deploy terakhir.
 * HANYA admin (read-only). Dipakai polling oleh DirtyBanner.
 *
 *   -> { ok: true, status: { state, runId, startedAt, updatedAt, actionsUrl } }
 */
export async function GET({ locals }: APIContext) {
  const supabase = getSupabaseFromLocals(locals);
  if (!supabase) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }
  const { user, profile } = locals;
  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  if (!hasRole(profile, "admin")) {
    return json({ ok: false, error: "forbidden_role" }, 403);
  }
  const status = await getDeployStatus();
  return json({
    ok: true,
    status: { ...status, actionsUrl: deployActionsUrl(status.runId) },
  });
}

/**
 * POST /api/admin/deploy-status — callback dari workflow deploy.yml.
 * Auth: header `Authorization: Bearer <CMS_DEPLOY_TOKEN>` (secret yang
 * sama dengan deploy-complete), dibandingkan timing-safe.
 *
 *   POST /api/admin/deploy-status  { state: "running" | "failed", run_id?: string }
 *
 * State "success" tidak lewat sini — ditangani deploy-complete (yang
 * juga men-clear dirty flag).
 */
export async function POST({ request }: APIContext) {
  const header = request.headers.get("Authorization");
  const provided =
    header?.startsWith("Bearer ") && header.slice(7).trim() !== ""
      ? header.slice(7).trim()
      : null;
  if (!tokenMatches(env.CMS_DEPLOY_TOKEN, provided)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const body = (await request.json().catch(() => null)) as {
    state?: unknown;
    run_id?: unknown;
  } | null;
  const state = body?.state;
  if (state !== "running" && state !== "failed") {
    return json({ ok: false, error: "bad_state" }, 400);
  }
  const runId =
    typeof body?.run_id === "string" && body.run_id !== "" ? body.run_id : null;
  await setDeployStatus(state, runId);
  return json({ ok: true, state });
}
