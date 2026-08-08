import type { APIRoute } from "astro";
import { getSupabase } from "../../lib/supabase";
import { isTurnstileEnabled, turnstile } from "../../lib/config";
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
 * Verifikasi token Turnstile via siteverify Cloudflare.
 * Return true bila Turnstile tidak dikonfigurasi (mode dev) ATAU
 * token valid. Token wajib ada & valid saat Turnstile aktif.
 */
async function verifyTurnstile(token: string | null): Promise<boolean> {
  if (!isTurnstileEnabled) return true;
  if (!token) return false;

  const form = new URLSearchParams({ secret: turnstile.secretKey, response: token });
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  }).catch(() => null);
  if (!res) return false;

  const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
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
    body = await request.json();
  } catch {
    return json({ ok: false, error: "validation" }, 400);
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
  const cfToken =
    typeof body["cf-turnstile-response"] === "string" ? body["cf-turnstile-response"] : "";
  if (!(await verifyTurnstile(cfToken))) {
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
