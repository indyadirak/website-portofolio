import type { APIRoute } from "astro";
import { getSupabase } from "../../lib/supabase";

/**
 * Endpoint kontak publik: /api/contact
 * - Validasi input (nama, email, pesan) dengan batas panjang.
 * - Honeypot "website": bot yang mengisinya dibalas sukses palsu (200)
 *   tanpa INSERT — tidak membocorkan bahwa deteksi terjadi.
 * - Rate limiting sederhana in-memory: maks 3 submission / IP / 10 menit.
 *   CATATAN: state in-memory tidak persisten antar instance/edge — lihat
 *   catatan deployment di akhir file.
 */

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const rateMap = new Map<string, { count: number; windowStart: number }>();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clientIp(request: Request, astroClientAddress: string | undefined): string {
  // Prioritas: header Cloudflare, lalu X-Forwarded-For, lalu clientAddress Astro.
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return astroClientAddress ?? "unknown";
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);

  // Pembersihan berkala agar map tidak membengkak.
  if (rateMap.size > 1000) {
    for (const [key, value] of rateMap) {
      if (now - value.windowStart >= RATE_LIMIT_WINDOW_MS) rateMap.delete(key);
    }
  }

  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count += 1;
  return false;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientIp(request, clientAddress);

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

  // ===== Rate limit =====
  if (isRateLimited(ip)) {
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

/**
 * CATATAN DEPLOYMENT (rate limiting in-memory):
 * - Node standalone: persisten per-instance process — cukup untuk 1 proses.
 * - Cloudflare Pages/Workers: setiap request bisa dilayani instance edge yang
 *   BERBEDA dan tidak saling berbagi state Map. Artinya: batas 3/10 menit
 *   diterapkan per-instance, bukan per-IP global — attacker bisa
 *   melempar lebih banyak request dengan mengeksploitasi multi-instance.
 *   Solusi produksi: KV (Cloudflare KV/R2 + counter), Redis, atau
 *   upstash ratelimit. Alternatif tanpa infra: verifikasi turnstile/CAPTCHA.
 */
