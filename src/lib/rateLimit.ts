/**
 * Rate limiter in-memory sederhana, dipakai BERSAMA oleh proteksi login
 * dan logger percobaan login (satu instance = satu mekanisme).
 *
 * CATATAN deployment: state tidak persisten antar instance/edge. Untuk
 * multi-instance gunakan KV/Redis; batas ini tetap mencegah banjir log
 * pada deployment single-instance (Node standalone) dan memperlambat
 * brute-force pada edge deployment.
 */

export interface RateLimiterOptions {
  /** Maksimal request yang diizinkan dalam window. */
  max: number;
  /** Panjang window dalam milidetik. */
  windowMs: number;
}

interface Entry {
  count: number;
  windowStart: number;
}

export function createRateLimiter({ max, windowMs }: RateLimiterOptions) {
  const map = new Map<string, Entry>();

  /** `true` bila request boleh lanjut; `false` bila harus ditolak (429). */
  function isAllowed(key: string): boolean {
    const now = Date.now();

    // Pembersihan berkala agar map tidak membengkak.
    if (map.size > 1000) {
      for (const [k, entry] of map) {
        if (now - entry.windowStart >= windowMs) map.delete(k);
      }
    }

    const entry = map.get(key);
    if (!entry || now - entry.windowStart >= windowMs) {
      map.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (entry.count >= max) return false;
    entry.count += 1;
    return true;
  }

  return { isAllowed };
}

/**
 * Instance GLOBAL untuk endpoint login — dipakai di /api/auth/login.
 * Semua jalur yang mencatat percobaan login berada DI DALAM alur yang
 * sama setelah cek isAllowed(), sehingga volume log terbatas
 * (max 5 percobaan / IP / 10 menit) dan tidak bisa dibanjiri terpisah.
 */
export const loginRateLimiter = createRateLimiter({
  max: 5,
  windowMs: 10 * 60 * 1000,
});
