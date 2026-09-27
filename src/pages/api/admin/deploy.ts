import type { APIContext } from "astro";
import { getSupabaseFromLocals, isAal2Session, json } from "../../../lib/api";
import { hasRole } from "../../../lib/auth";
import { adminMutationGuard } from "../../../lib/rateLimit";
import { requestSiteDeploy } from "../../../lib/deploy";

export const prerender = false;

/**
 * Trigger rebuild production manual (tombol "Publish" di dashboard).
 *
 *   POST /api/admin/deploy — HANYA admin + AAL2.
 *
 * Memicu workflow GitHub Actions "Deploy to Cloudflare Workers" via
 * workflow_dispatch. Cooldown 10 menit dibagi dengan trigger otomatis
 * pasca-mutasi (lihat src/lib/deploy.ts) agar CI tidak di-spam.
 */
export async function POST({ locals }: APIContext) {
  const supabase = getSupabaseFromLocals(locals);
  if (!supabase) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }

  const { user, profile } = locals;
  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  if (!hasRole(profile, "admin")) {
    return json({ ok: false, error: "forbidden_role" }, 403);
  }
  if (!(await isAal2Session(supabase))) {
    return json({ ok: false, error: "mfa_required" }, 403);
  }

  const mutationDecision = await adminMutationGuard.check(user.id);
  if (mutationDecision.reason === "kv_unavailable") {
    return json({ ok: false, error: "service_unavailable" }, 503);
  }
  if (!mutationDecision.allowed) {
    return json({ ok: false, error: "too_many_requests" }, 429);
  }

  const result = await requestSiteDeploy("manual");

  if (result.status === "triggered") {
    return json({ ok: true, deploy: "triggered" });
  }
  if (result.status === "cooldown") {
    return json(
      { ok: true, deploy: "cooldown", retryAfterSec: result.retryAfterSec ?? 0 },
      200
    );
  }
  return json({ ok: false, error: result.reason ?? "deploy_trigger_failed" }, 503);
}

export async function GET() {
  return json({ ok: false, error: "method_not_allowed" }, 405);
}
