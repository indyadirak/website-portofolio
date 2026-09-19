import type { APIRoute } from "astro";
import { getSupabase } from "../../lib/supabase";
import { turnstile, getTurnstileSecretKey } from "../../lib/config";
import { contactRateLimiter } from "../../lib/rateLimit";

/**
 * Endpoint kontak publik: /api/contact
 * - Validasi input (nama, email, pesan) dengan batas panjang.
 * - Honeypot "website": bot yang mengisinya dibalas sukses palsu (200)
 *   tanpa INSERT — tidak membocorkan bahwa deteksi terjadi.
 * - Turnstile (Cloudflare): wajib token valid bila dikonfigurasi.
 * - Rate limiting Cloudflare KV (edge-consistent): maks 3 submission /
 *   IP / 10 menit — lihat contactRateLimiter di src/lib/rateLimit.ts.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clientIp(request: Request): string {
  // Prioritas: header Cloudflare (cf-connecting-ip), lalu X-Forwarded-For.
  // CATATAN: Astro.clientAddress TIDAK tersedia di @astrojs/cloudflare —
  // adapter menyediakan cf-connecting-ip yang otomatis di-set oleh edge.
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

/**
 * Verifikasi token Turnstile via siteverify Cloudflare (server-side).
 *
 * SANGAT PENTING — format body: Cloudflare Turnstile siteverify HANYA
 * menerima `application/x-www-form-urlencoded` (URLSearchParams). Body
 * JSON (`JSON.stringify`) akan ditolak. Ini sudah sesuai standar resmi:
 *   POST https://challenges.cloudflare.com/turnstile/v0/siteverify
 *   body: secret=<SECRET>&response=<TOKEN>[&remoteip=<IP>]
 *
 * Return true bila Turnstile tidak dikonfigurasi (siteKey kosong — mode
 * dev) ATAU token valid. Token wajib ada & valid saat Turnstile aktif.
 * FAIL CLOSED bila widget tampil tapi secret runtime hilang (misconfig):
 * tolak daripada membiarkan submit lolos tanpa verifikasi.
 *
 * Secret key dibaca dari RUNTIME binding (env.TURNSTILE_SECRET_KEY —
 * di-set deploy.yml via `wrangler secret put`), bukan dari build artifact.
 */
async function verifyTurnstile(token: string | null, remoteIp: string): Promise<boolean> {
  if (!turnstile.siteKey) return true;

  const secret = getTurnstileSecretKey();
  if (!secret) {
    console.error(
      "[api/contact] TURNSTILE_SECRET_KEY tidak tersedia di runtime — " +
        "set via `npx wrangler secret put TURNSTILE_SECRET_KEY`."
    );
    return false;
  }
  if (!token) {
    return false;
  }

  const form = new URLSearchParams({ secret, response: token });
  if (remoteIp && remoteIp !== "unknown") {
    form.set("remoteip", remoteIp);
  }

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  }).catch(() => null);
  if (!res) {
    console.error("[api/contact] Turnstile verification request failed");
    return false;
  }

  const data = (await res.json().catch(() => null)) as {
    success?: boolean;
    "error-codes"?: string[];
    action?: string;
    hostname?: string;
  } | null;

  return data?.success === true;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const ip = clientIp(request);

  let body: Record<string, unknown>;
  try {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries());
  } catch {
    return json({ ok: false, error: "invalid_form_data" }, 400);
  }

  // ===== Honeypot: diam-diam diterima, tapi dibuang =====
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return json({ ok: true });
  }

  // ===== Validasi input =====
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (
    name.length < 2 ||
    name.length > 100 ||
    email.length < 5 ||
    email.length > 254 ||
    !EMAIL_RE.test(email) ||
    message.length < 10 ||
    message.length > 5000
  ) {
    return json({ ok: false, error: "validation" }, 400);
  }

  // ===== Turnstile: token wajib valid bila dikonfigurasi =====
  // Token dibaca dari FormData dengan key standar Turnstile.
  const cfToken =
    typeof body["cf-turnstile-response"] === "string" ? body["cf-turnstile-response"] : "";
  if (!(await verifyTurnstile(cfToken, ip))) {
    return json({ ok: false, error: "captcha_failed" }, 400);
  }

  // ===== Rate limit (Cloudflare KV — 3 / IP / 10 menit) =====
  // Urutan dipertahankan: honeypot & validasi & Turnstile tetap SEBELUM ini.
  if (!(await contactRateLimiter.isAllowed(ip))) {
    return json({ ok: false, error: "too_many_requests" }, 429);
  }

  // ===== Simpan ke Supabase =====
  const supabase = getSupabase();
  if (!supabase) {
    return json({ ok: false, error: "not_configured" }, 503);
  }

  const { error } = await supabase.from("contact_messages").insert({ name, email, message });
  if (error) {
    console.error("[api/contact] insert error:", error.message);
    return json({ ok: false, error: "server" }, 500);
  }

  return json({ ok: true });
};

export const GET: APIRoute = () => json({ ok: false, error: "method_not_allowed" }, 405);
