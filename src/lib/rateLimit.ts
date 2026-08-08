import { env } from "cloudflare:workers";

/**
 * Rate limiter berbasis Cloudflare KV (Workers KV) — edge-consistent untuk
 * deployment Cloudflare Pages/Workers, dipakai BERSAMA oleh proteksi login
 * dan logger percobaan login (satu instance = satu mekanisme).
 *
 * Storage: satu key KV per identifier (`ratelimit:<layanan>:<identifier>`),
 * berisi JSON { count, windowStart }, dengan TTL bawaan KV (expirationTtl)
 * sebesar jendela limit. Setiap penulisan menyegarkan TTL (window bergeser).
 *
 * CATATAN KV:
 * - Read-after-write konsisten di lokasi edge yang sama — cukup untuk
 *   burst rate limiting single-tenant skala ini. Increment read-modify-write
 *   tidak atomik antar edge; bila butuh penegakan sangat ketat, gunakan
 *   Durable Object sebagai gantinya.
 */

export interface RateLimiterOptions {
  /** Maksimal request yang diizinkan dalam window. */
  max: number;
  /** Panjang window dalam milidetik. */
  windowMs: number;
  /** Prefix key KV, mis. "ratelimit:login:" — memisahkan identifier per layanan. */
  keyPrefix: string;
}

interface Entry {
  count: number;
  windowStart: number;
}

export function createRateLimiter({ max, windowMs, keyPrefix }: RateLimiterOptions) {
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));

  // Fallback IN-MEMORY — HANYA untuk local dev (npm run dev) tanpa binding.
  // Kunci: `import.meta.env.DEV` diganti literal `false` saat build produksi,
  // jadi branch ini ter-dead-code-eliminate dan TIDAK PERNAH aktif di Pages.
  const devMap = new Map<string, Entry>();

  /** `true` bila request boleh lanjut; `false` bila harus ditolak (429). */
  async function isAllowed(identifier: string): Promise<boolean> {
    const kv = env.RATE_LIMIT_KV;
    const storageKey = `${keyPrefix}${identifier}`;
    const now = Date.now();

    if (!kv) {
      if (!import.meta.env.DEV) {
        // Misconfig production (binding tidak terpasang) — bunyikan alarm,
        // jangan diam-diam memblokir seluruh login. Fail-open + log keras.
        console.error(
          "[rate-limit] Binding KV RATE_LIMIT_KV tidak ditemukan di production — " +
            "rate limiting TIDAK aktif! Cek Settings > Functions > KV namespace bindings."
        );
        return true;
      }

      // Dev-only fallback (in-memory): behavior identik dengan KV path.
      const entry = devMap.get(storageKey);
      if (!entry || now - entry.windowStart >= windowMs) {
        devMap.set(storageKey, { count: 1, windowStart: now });
        return true;
      }
      if (entry.count >= max) return false;
      entry.count += 1;
      return true;
    }

    // ===== Path produksi: Workers KV =====
    let entry: Entry | null = null;
    const raw = await kv.get(storageKey);
    if (raw) {
      try {
        entry = JSON.parse(raw) as Entry;
      } catch {
        entry = null;
      }
    }

    if (!entry || now - entry.windowStart >= windowMs) {
      await kv.put(storageKey, JSON.stringify({ count: 1, windowStart: now }), {
        expirationTtl: windowSec,
      });
      return true;
    }
    if (entry.count >= max) return false;
    entry.count += 1;
    await kv.put(storageKey, JSON.stringify(entry), { expirationTtl: windowSec });
    return true;
  }

  return { isAllowed };
}

/**
 * Login: maks 5 percobaan / IP / 10 menit (TTL 600s).
 * Logger percobaan login berada DI DALAM alur yang sama setelah cek ini,
 * sehingga volume log terbatas (bounded) — tidak bisa dibanjiri terpisah.
 */
export const loginRateLimiter = createRateLimiter({
  keyPrefix: "ratelimit:login:",
  max: 5,
  windowMs: 10 * 60 * 1000,
});

/**
 * Contact: maks 3 submission / IP / 10 menit (TTL 600s).
 */
export const contactRateLimiter = createRateLimiter({
  keyPrefix: "ratelimit:contact:",
  max: 3,
  windowMs: 10 * 60 * 1000,
});
