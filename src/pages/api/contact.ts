import type { APIRoute } from "astro";
import { getSupabase } from "../../lib/supabase";
import { contactRateLimiter } from "../../lib/rateLimit";
import { verifyTurnstileToken } from "../../lib/turnstile";

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
  const turnstileResult = await verifyTurnstileToken(cfToken, ip);
  if (!turnstileResult.ok) {
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
