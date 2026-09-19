import type { APIRoute } from "astro";
import { getSupabase } from "../../lib/supabase";
import { json } from "../../lib/api";
import { createRateLimiter } from "../../lib/rateLimit";

export const prerender = false;

const healthRateLimiter = createRateLimiter({
  max: 30,
  windowMs: 60_000,
  keyPrefix: "ratelimit:health:",
});

/**
 * Health check publik ringan: GET /api/health
 * - Tanpa auth, tanpa PII, tanpa secret. Respons hanya status.
 * - Menjalankan query riil (tapi ringan: count head site_settings) ke
 *   Postgres pada SETIAP panggilan — sehingga request ini membuat project
 *   Supabase tercatat "aktif" dan mencegah auto-pause free tier.
 *   Dipakai oleh workflow .github/workflows/supabase-keep-alive.yml.
 *   (Halaman HTML publik TIDAK bisa dipakai untuk ini: semuanya
 *   di-prerender jadi statis, tanpa query DB saat request.)
 * - Anti-500: error DB -> 503 {ok:false}; Supabase belum dikonfigurasi
 *   (mode demo) -> 200 {ok:true, db:"not_configured"}.
 */
export const GET: APIRoute = async ({ request }) => {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await healthRateLimiter.isAllowed(ip))) {
    return json({ ok: false, error: "too_many_requests" }, 429);
  }
  const supabase = getSupabase();

  if (!supabase) {
    return json({ ok: true, db: "not_configured" });
  }

  try {
    const { error } = await supabase
      .from("site_settings")
      .select("id", { count: "exact", head: true });

    if (error) {
      console.error("[health] Query DB gagal:", error.message);
      return json({ ok: false, db: "error" }, 503);
    }

    return json({ ok: true, db: "ok" });
  } catch (err) {
    console.error("[health] Exception saat query DB:", err);
    return json({ ok: false, db: "error" }, 503);
  }
};
