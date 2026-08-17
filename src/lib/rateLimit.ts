import { env } from "cloudflare:workers";

/**
 * =====================================================================
 * KONSTANTA KEAMANAN LOGIN — ubah semua angka di sini, jangan di tempat lain.
 * =====================================================================
 */
export const LOGIN_LIMITS = {
  /** Batas percobaan per-IP MURNI per window (anti enumerasi email). */
  IP_MAX_FAILURES: 10,
  /** Batas percobaan per kombinasi IP+email per window. */
  CRED_MAX_FAILURES: 3,
  /** Jendela hitung percobaan (di bawah). */
  WINDOW_MS: 10 * 60 * 1000,
  /** Durasi lockout level 1 (setelah CRED_MAX_FAILURES gagal). */
  LOCKOUT_BASE_MS: 15 * 60 * 1000,
  /** Durasi lockout maksimum (progresif: 15m -> 30m -> 60m -> ... ). */
  LOCKOUT_MAX_MS: 4 * 60 * 60 * 1000,
  /** Buffer TTL key lockout di atas durasinya (menyimpan level untuk
   *  hitungan lockout berikutnya setelah cooldown berakhir). */
  LOCKOUT_TTL_BUFFER_SEC: 10 * 60,
} as const;

const WINDOW_SEC = Math.max(1, Math.ceil(LOGIN_LIMITS.WINDOW_MS / 1000));

/**
 * =====================================================================
 * KONSTANTA KEAMANAN ENDPOINT /api/backup-config (GitHub Actions).
 * Endpoint ini me-return kredensial backup terdekripsi — dilindungi
 * setara login (fail-closed), TAPI lebih ketat per-IP.
 * =====================================================================
 */
export const BACKUP_CONFIG_LIMITS = {
  /** Maks percobaan gagal (Bearer token salah) per-IP per window. */
  IP_MAX_FAILURES: 5,
  /** Jendela hitung (10 menit, sama dengan login). */
  WINDOW_MS: 10 * 60 * 1000,
  /** Buffer TTL key agar window sempat terbaca saat mau kedaluwarsa. */
  TTL_BUFFER_SEC: 60,
} as const;

const BACKUP_CONFIG_WINDOW_SEC = Math.max(
  1,
  Math.ceil(BACKUP_CONFIG_LIMITS.WINDOW_MS / 1000)
);

/**
 * =====================================================================
 * KONSTANTA RATE LIMIT VERIFIKASI MFA (mfa-verify & mfa-enroll-verify).
 * Kode TOTP 6 digit mudah ditebak ulang; Supabase punya throttle bawaan,
 * tapi lapisan aplikasi ditambah di sini supaya kendali & logika lockout
 * konsisten dengan endpoint sensitif lain.
 * =====================================================================
 */
export const MFA_VERIFY_LIMITS = {
  /** Maks percobaan GAGAL (kode 6 digit salah) per-IP per window. */
  IP_MAX_FAILURES: 10,
  /** Jendela hitung (10 menit, sama dengan login). */
  WINDOW_MS: 10 * 60 * 1000,
  /** Buffer TTL key agar window sempat terbaca saat mau kedaluwarsa. */
  TTL_BUFFER_SEC: 60,
} as const;

const MFA_VERIFY_WINDOW_SEC = Math.max(
  1,
  Math.ceil(MFA_VERIFY_LIMITS.WINDOW_MS / 1000)
);

/**
 * =====================================================================
 * KONSTANTA RATE LIMIT NAVIGASI HALAMAN (middleware SSR).
 * Melindungi halaman HTML (bukan API — tiap endpoint punya guard sendiri)
 * dari hammering/scraping. Fail-OPEN: kalau KV tidak tersedia, navigasi
 * tetap dilayani (availability > limit; endpoint sensitif sudah fail-closed).
 * =====================================================================
 */
export const PAGE_NAV_LIMITS = {
  /** Maks request per-IP per window (halaman HTML saja). */
  MAX_REQUESTS: 60,
  /** Jendela hitung (1 menit). */
  WINDOW_MS: 60 * 1000,
  /** Buffer TTL key (menit) agar window sempat terbaca saat mau kedaluwarsa. */
  TTL_BUFFER_SEC: 60,
} as const;

const PAGE_NAV_WINDOW_SEC = Math.max(1, Math.ceil(PAGE_NAV_LIMITS.WINDOW_MS / 1000));

/** Durasi lockout level ke-n (progresif, capped di LOCKOUT_MAX_MS). */
function lockoutDurationMs(level: number): number {
  const d = LOGIN_LIMITS.LOCKOUT_BASE_MS * 2 ** (level - 1);
  return Math.min(d, LOGIN_LIMITS.LOCKOUT_MAX_MS);
}

// ===== Skema key KV =====
//   ratelimit:contact:<ip>                    counter submission kontak (3x/10m)
//   ratelimit:loginip:<ip>                    counter percobaan login per-IP (10x/10m)
//   ratelimit:loginc:<ip>:<email>             counter percobaan login per-IP+email (3x/10m)
//   ratelimit:lockout:<ip>:<email>            state lockout progresif {level, until}
//   ratelimit:backupcfg:<ip>                  counter token salah /api/backup-config (5x/10m)
//   ratelimit:mfaip:<ip>                      counter kode MFA salah (10x/10m)
//   ratelimit:pagenav:<ip>                    counter navigasi halaman HTML (60x/1m)
const KEY = {
  contact: "ratelimit:contact:",
  loginIp: "ratelimit:loginip:",
  loginCred: "ratelimit:loginc:",
  loginLockout: "ratelimit:lockout:",
  backupConfig: "ratelimit:backupcfg:",
  mfaIp: "ratelimit:mfaip:",
  pageNav: "ratelimit:pagenav:",
} as const;

interface Entry {
  count: number;
  windowStart: number;
}

interface LockoutEntry {
  level: number;
  until: number;
}

function parseEntry(raw: string | null): Entry | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Entry;
  } catch {
    return null;
  }
}

function parseLockout(raw: string | null): LockoutEntry | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LockoutEntry;
  } catch {
    return null;
  }
}

/** `true` bila window entry masih berlaku (bukan expired). */
function inWindow(
  entry: { windowStart: number },
  now: number,
  windowMs = LOGIN_LIMITS.WINDOW_MS
): boolean {
  return now - entry.windowStart < windowMs;
}

/**
 * =====================================================================
 * Rate limiter sederhana (digunakan OLEH KONTAK — jangan dipakai login).
 * Fail-OPEN: kalau binding KV hilang, izinkan (dampak hanya spam form).
 * =====================================================================
 */
export function createRateLimiter({ max, windowMs, keyPrefix }: {
  max: number;
  windowMs: number;
  keyPrefix: string;
}) {
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));

  // Fallback IN-MEMORY — HANYA untuk local dev (npm run dev) tanpa binding.
  const devMap = new Map<string, Entry>();

  /** `true` bila request boleh lanjut; `false` bila harus ditolak (429). */
  async function isAllowed(identifier: string): Promise<boolean> {
    const kv = env.RATE_LIMIT_KV;
    const storageKey = `${keyPrefix}${identifier}`;
    const now = Date.now();

    if (!kv) {
      if (!import.meta.env.DEV) {
        console.error(
          "[rate-limit] Binding KV RATE_LIMIT_KV tidak ditemukan di production — " +
            "rate limiting kontak TIDAK aktif (fail-open)."
        );
        return true;
      }
      const entry = devMap.get(storageKey);
      if (!entry || now - entry.windowStart >= windowMs) {
        devMap.set(storageKey, { count: 1, windowStart: now });
        return true;
      }
      if (entry.count >= max) return false;
      entry.count += 1;
      return true;
    }

    let entry = parseEntry(await kv.get(storageKey));
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
 * Contact: maks 3 submission / IP / 10 menit (TTL 600s). FAIL-OPEN.
 */
export const contactRateLimiter = createRateLimiter({
  keyPrefix: KEY.contact,
  max: 3,
  windowMs: LOGIN_LIMITS.WINDOW_MS,
});

// =====================================================================
// LOGIN GUARD — proteksi brute-force login admin.
//   * Lapisan 1: per-IP murni (LOGIN_LIMITS.IP_MAX_FAILURES per window)
//   * Lapisan 2: per kombinasi IP+email (CRED_MAX_FAILURES) -> LOCKOUT
//     progresif (15m -> 30m -> 60m -> ... maks 4 jam)
//   * FAIL-CLOSED: kalau KV tidak tersedia/gagal diakses saat CHECK,
//     login DITOLAK (reason "kv_unavailable" -> endpoint balas 503).
//     (Fallback in-memory hanya aktif di dev agar `npm run dev` tetap
//     bisa dipakai tanpa binding — tidak pernah di build produksi.)
// =====================================================================
export type LoginBlockedReason = "lockout" | "kv_unavailable";

export interface LoginRateDecision {
  allowed: boolean;
  /** Alasan penolakan saat !allowed. */
  reason?: LoginBlockedReason;
  /** Estimasi detik hingga boleh mencoba lagi (hanya saat lockout). */
  retryAfterSec?: number;
}

export const loginAttemptGuard = {
  async check(ip: string, email: string): Promise<LoginRateDecision> {
    const kv = env.RATE_LIMIT_KV;
    const now = Date.now();

    if (!kv) {
      if (!import.meta.env.DEV) {
        console.error(
          "[login-guard] RATE_LIMIT_KV tidak tersedia — FAIL CLOSED: login ditolak."
        );
        return { allowed: false, reason: "kv_unavailable" };
      }
      // Dev-only in-memory (perilaku identik dengan KV path).
      return devGuard.check(ip, email);
    }

    try {
      // ===== Lapisan 1: per-IP =====
      const ipEntry = parseEntry(await kv.get(KEY.loginIp + ip));
      if (ipEntry && inWindow(ipEntry, now) && ipEntry.count >= LOGIN_LIMITS.IP_MAX_FAILURES) {
        return {
          allowed: false,
          reason: "lockout",
          retryAfterSec: Math.ceil((ipEntry.windowStart + LOGIN_LIMITS.WINDOW_MS - now) / 1000),
        };
      }

      // ===== Lapisan 2a: lockout aktif untuk IP+email =====
      const lockKey = KEY.loginLockout + `${ip}:${email}`;
      const lock = parseLockout(await kv.get(lockKey));
      if (lock && lock.until > now) {
        return {
          allowed: false,
          reason: "lockout",
          retryAfterSec: Math.ceil((lock.until - now) / 1000),
        };
      }

      // ===== Lapisan 2b: counter IP+email (defensif — normalnya lockout
      // sudah aktif sebelum counter menyentuh batas). =====
      const credEntry = parseEntry(await kv.get(KEY.loginCred + `${ip}:${email}`));
      if (credEntry && inWindow(credEntry, now) && credEntry.count >= LOGIN_LIMITS.CRED_MAX_FAILURES) {
        return {
          allowed: false,
          reason: "lockout",
          retryAfterSec: Math.ceil((credEntry.windowStart + LOGIN_LIMITS.WINDOW_MS - now) / 1000),
        };
      }

      return { allowed: true };
    } catch (err) {
      // KV read error — fail closed: tolak daripada memproses tanpa proteksi.
      console.error("[login-guard] KV read gagal — FAIL CLOSED:", err);
      return { allowed: false, reason: "kv_unavailable" };
    }
  },

  /** Panggil SETELAH signInWithPassword gagal (kredensial salah). */
  async recordFailure(ip: string, email: string): Promise<void> {
    const kv = env.RATE_LIMIT_KV;
    const now = Date.now();

    if (!kv) {
      if (import.meta.env.DEV) return devGuard.recordFailure(ip, email);
      return;
    }

    try {
      // ===== Lapisan 1: increment per-IP =====
      const ipKey = KEY.loginIp + ip;
      const ipEntry = parseEntry(await kv.get(ipKey));
      const nextIp = ipEntry && inWindow(ipEntry, now)
        ? { count: ipEntry.count + 1, windowStart: ipEntry.windowStart }
        : { count: 1, windowStart: now };
      await kv.put(ipKey, JSON.stringify(nextIp), { expirationTtl: WINDOW_SEC });

      // ===== Lapisan 2: increment IP+email + aktivasi lockout progresif =====
      const credKey = KEY.loginCred + `${ip}:${email}`;
      const lockKey = KEY.loginLockout + `${ip}:${email}`;
      const credEntry = parseEntry(await kv.get(credKey));
      const nextCred = credEntry && inWindow(credEntry, now)
        ? { count: credEntry.count + 1, windowStart: credEntry.windowStart }
        : { count: 1, windowStart: now };

      if (nextCred.count >= LOGIN_LIMITS.CRED_MAX_FAILURES) {
        // Lockout sebelumnya pasti sudah expired (kalau aktif, check() tadi
        // menolak sebelum sampai ke sini) -> level dinaikkan = progresif.
        const prevLock = parseLockout(await kv.get(lockKey));
        const level = prevLock ? prevLock.level + 1 : 1;
        const durationMs = lockoutDurationMs(level);
        const until = now + durationMs;

        await kv.put(lockKey, JSON.stringify({ level, until }), {
          expirationTtl: Math.ceil(durationMs / 1000) + LOGIN_LIMITS.LOCKOUT_TTL_BUFFER_SEC,
        });
        // Reset counter: window hitung dimulai ulang setelah cooldown.
        await kv.put(credKey, JSON.stringify({ count: 0, windowStart: now }), {
          expirationTtl: WINDOW_SEC,
        });
      } else {
        await kv.put(credKey, JSON.stringify(nextCred), { expirationTtl: WINDOW_SEC });
      }
    } catch (err) {
      // Percobaan sudah diproses (login gagal) — state limiter gagal dicatat.
      console.error("[login-guard] KV write gagal saat recordFailure:", err);
    }
  },

  /** Panggil SETELAH login berhasil — reset counter & lockout IP+email. */
  async recordSuccess(ip: string, email: string): Promise<void> {
    const kv = env.RATE_LIMIT_KV;
    if (!kv) {
      if (import.meta.env.DEV) return devGuard.recordSuccess(ip, email);
      return;
    }
    try {
      await kv.delete(KEY.loginCred + `${ip}:${email}`);
      await kv.delete(KEY.loginLockout + `${ip}:${email}`);
    } catch (err) {
      console.error("[login-guard] KV delete gagal saat recordSuccess:", err);
    }
  },
};

// =====================================================================
// BACKUP-CONFIG GUARD — proteksi endpoint /api/backup-config (GitHub
// Actions) yang me-return kredensial backup TERDEKRIPSI.
//   * Hanya menghitung percobaan GAGAL (Bearer token salah) per-IP
//     (BACKUP_CONFIG_LIMITS.IP_MAX_FAILURES per window).
//   * Sukses (token benar) MERESET counter — alur workflow normal sekali
//     seminggu tidak akan pernah terblokir.
//   * FAIL-CLOSED: kalau KV tidak tersedia/gagal saat CHECK, request
//     DITOLAK (reason "kv_unavailable" -> endpoint balas 503) — jangan
//     pernah memproses endpoint tanpa proteksi.
//     (Fallback in-memory hanya aktif di dev — tidak pernah di produksi.)
// =====================================================================
export type BackupConfigBlockedReason = "rate_limited" | "kv_unavailable";

export interface BackupConfigRateDecision {
  allowed: boolean;
  reason?: BackupConfigBlockedReason;
  retryAfterSec?: number;
}

export const backupConfigAttemptGuard = {
  // Fallback dev-only in-memory (perilaku identik dengan KV path).
  _dev: new Map<string, Entry>(),

  async check(ip: string): Promise<BackupConfigRateDecision> {
    const kv = env.RATE_LIMIT_KV;
    const now = Date.now();
    const storageKey = KEY.backupConfig + ip;
    const windowMs = BACKUP_CONFIG_LIMITS.WINDOW_MS;

    if (!kv) {
      if (!import.meta.env.DEV) {
        console.error(
          "[backupcfg-guard] RATE_LIMIT_KV tidak tersedia — FAIL CLOSED: request ditolak."
        );
        return { allowed: false, reason: "kv_unavailable" };
      }
      const entry = this._dev.get(storageKey);
      if (entry && inWindow(entry, now, windowMs) && entry.count >= BACKUP_CONFIG_LIMITS.IP_MAX_FAILURES) {
        return {
          allowed: false,
          reason: "rate_limited",
          retryAfterSec: Math.ceil((entry.windowStart + windowMs - now) / 1000),
        };
      }
      return { allowed: true };
    }

    try {
      const entry = parseEntry(await kv.get(storageKey));
      if (entry && inWindow(entry, now, windowMs) && entry.count >= BACKUP_CONFIG_LIMITS.IP_MAX_FAILURES) {
        return {
          allowed: false,
          reason: "rate_limited",
          retryAfterSec: Math.ceil((entry.windowStart + windowMs - now) / 1000),
        };
      }
      return { allowed: true };
    } catch (err) {
      console.error("[backupcfg-guard] KV read gagal — FAIL CLOSED:", err);
      return { allowed: false, reason: "kv_unavailable" };
    }
  },

  /** Panggil SETELAH token terbukti salah — increment counter per-IP. */
  async recordFailure(ip: string): Promise<void> {
    const kv = env.RATE_LIMIT_KV;
    const now = Date.now();
    const storageKey = KEY.backupConfig + ip;
    const windowMs = BACKUP_CONFIG_LIMITS.WINDOW_MS;

    if (!kv) {
      if (import.meta.env.DEV) {
        const entry = this._dev.get(storageKey);
        this._dev.set(
          storageKey,
          entry && inWindow(entry, now, windowMs)
            ? { count: entry.count + 1, windowStart: entry.windowStart }
            : { count: 1, windowStart: now }
        );
      }
      return;
    }

    try {
      const entry = parseEntry(await kv.get(storageKey));
      const next = entry && inWindow(entry, now, windowMs)
        ? { count: entry.count + 1, windowStart: entry.windowStart }
        : { count: 1, windowStart: now };
      await kv.put(storageKey, JSON.stringify(next), {
        expirationTtl: BACKUP_CONFIG_WINDOW_SEC + BACKUP_CONFIG_LIMITS.TTL_BUFFER_SEC,
      });
    } catch (err) {
      console.error("[backupcfg-guard] KV write gagal saat recordFailure:", err);
    }
  },

  /** Panggil SETELAH token terbukti benar — reset counter per-IP. */
  async recordSuccess(ip: string): Promise<void> {
    const kv = env.RATE_LIMIT_KV;
    const storageKey = KEY.backupConfig + ip;

    if (!kv) {
      if (import.meta.env.DEV) this._dev.delete(storageKey);
      return;
    }

    try {
      await kv.delete(storageKey);
    } catch (err) {
      console.error("[backupcfg-guard] KV delete gagal saat recordSuccess:", err);
    }
  },
};

// =====================================================================
// MFA VERIFY GUARD — proteksi endpoint /api/auth/mfa-verify &
// /api/auth/mfa-enroll-verify (verifikasi kode TOTP 6 digit).
//   * Hanya menghitung percobaan GAGAL (kode salah) per-IP per window.
//   * Sukses (kode benar) MERESET counter.
//   * FAIL-CLOSED: kalau KV tidak tersedia/gagal saat CHECK, request
//     DITOLAK (reason "kv_unavailable" -> endpoint balas 503).
//     (Fallback in-memory hanya aktif di dev — tidak pernah di produksi.)
// =====================================================================
export type MfaBlockedReason = "rate_limited" | "kv_unavailable";

export interface MfaRateDecision {
  allowed: boolean;
  reason?: MfaBlockedReason;
  retryAfterSec?: number;
}

export const mfaVerifyGuard = {
  // Fallback dev-only in-memory (identik behavior, tanpa KV).
  _dev: new Map<string, Entry>(),

  async check(ip: string): Promise<MfaRateDecision> {
    const kv = env.RATE_LIMIT_KV;
    const now = Date.now();
    const storageKey = KEY.mfaIp + ip;
    const windowMs = MFA_VERIFY_LIMITS.WINDOW_MS;

    if (!kv) {
      if (!import.meta.env.DEV) {
        console.error(
          "[mfa-guard] RATE_LIMIT_KV tidak tersedia — FAIL CLOSED: verifikasi ditolak."
        );
        return { allowed: false, reason: "kv_unavailable" };
      }
      const entry = this._dev.get(storageKey);
      if (entry && inWindow(entry, now, windowMs) && entry.count >= MFA_VERIFY_LIMITS.IP_MAX_FAILURES) {
        return {
          allowed: false,
          reason: "rate_limited",
          retryAfterSec: Math.ceil((entry.windowStart + windowMs - now) / 1000),
        };
      }
      return { allowed: true };
    }

    try {
      const entry = parseEntry(await kv.get(storageKey));
      if (entry && inWindow(entry, now, windowMs) && entry.count >= MFA_VERIFY_LIMITS.IP_MAX_FAILURES) {
        return {
          allowed: false,
          reason: "rate_limited",
          retryAfterSec: Math.ceil((entry.windowStart + windowMs - now) / 1000),
        };
      }
      return { allowed: true };
    } catch (err) {
      console.error("[mfa-guard] KV read gagal — FAIL CLOSED:", err);
      return { allowed: false, reason: "kv_unavailable" };
    }
  },

  /** Panggil SETELAH kode MFA terbukti salah — increment counter per-IP. */
  async recordFailure(ip: string): Promise<void> {
    const kv = env.RATE_LIMIT_KV;
    const now = Date.now();
    const storageKey = KEY.mfaIp + ip;
    const windowMs = MFA_VERIFY_LIMITS.WINDOW_MS;

    if (!kv) {
      if (import.meta.env.DEV) {
        const entry = this._dev.get(storageKey);
        this._dev.set(
          storageKey,
          entry && inWindow(entry, now, windowMs)
            ? { count: entry.count + 1, windowStart: entry.windowStart }
            : { count: 1, windowStart: now }
        );
      }
      return;
    }

    try {
      const entry = parseEntry(await kv.get(storageKey));
      const next = entry && inWindow(entry, now, windowMs)
        ? { count: entry.count + 1, windowStart: entry.windowStart }
        : { count: 1, windowStart: now };
      await kv.put(storageKey, JSON.stringify(next), {
        expirationTtl: MFA_VERIFY_WINDOW_SEC + MFA_VERIFY_LIMITS.TTL_BUFFER_SEC,
      });
    } catch (err) {
      console.error("[mfa-guard] KV write gagal saat recordFailure:", err);
    }
  },

  /** Panggil SETELAH kode MFA terbukti benar — reset counter per-IP. */
  async recordSuccess(ip: string): Promise<void> {
    const kv = env.RATE_LIMIT_KV;
    const storageKey = KEY.mfaIp + ip;

    if (!kv) {
      if (import.meta.env.DEV) this._dev.delete(storageKey);
      return;
    }

    try {
      await kv.delete(storageKey);
    } catch (err) {
      console.error("[mfa-guard] KV delete gagal saat recordSuccess:", err);
    }
  },
};

// =====================================================================
// PAGE NAVIGATION GUARD — proteksi halaman HTML (middleware SSR).
//   * Berbeda dari endpoint: FAIL-OPEN (availability diutamakan; kalau KV
//     tidak tersedia/gagal, navigasi tetap dilayani). Endpoint sensitif
//     (login, backup-config) tetap fail-closed dengan guard masing-masing.
//   * Hanya menghitung request halaman (bukan aset statis /_astro, bukan
//     /api/*) — lihat middleware.ts.
//   * Saat limit tercapai, middleware me-rewrite ke halaman 429.astro.
// =====================================================================
export interface PageNavDecision {
  allowed: boolean;
  /** Estimasi detik hingga boleh navigasi lagi (hanya saat ditolak). */
  retryAfterSec?: number;
}

export const pageNavigationGuard = {
  // Fallback dev-only in-memory (identik behavior, tanpa KV).
  _dev: new Map<string, Entry>(),

  async check(ip: string): Promise<PageNavDecision> {
    const kv = env.RATE_LIMIT_KV;
    const now = Date.now();
    const storageKey = KEY.pageNav + ip;
    const windowMs = PAGE_NAV_LIMITS.WINDOW_MS;

    if (!kv) {
      if (import.meta.env.DEV) {
        const entry = this._dev.get(storageKey);
        if (entry && inWindow(entry, now, windowMs)) {
          if (entry.count >= PAGE_NAV_LIMITS.MAX_REQUESTS) {
            return {
              allowed: false,
              retryAfterSec: Math.ceil((entry.windowStart + windowMs - now) / 1000),
            };
          }
          entry.count += 1;
        } else {
          this._dev.set(storageKey, { count: 1, windowStart: now });
        }
        return { allowed: true };
      }
      // Production tanpa binding KV: fail-open (halaman tetap dilayani).
      return { allowed: true };
    }

    try {
      const entry = parseEntry(await kv.get(storageKey));
      if (entry && inWindow(entry, now, windowMs)) {
        if (entry.count >= PAGE_NAV_LIMITS.MAX_REQUESTS) {
          return {
            allowed: false,
            retryAfterSec: Math.ceil((entry.windowStart + windowMs - now) / 1000),
          };
        }
        entry.count += 1;
        await kv.put(storageKey, JSON.stringify(entry), {
          expirationTtl: PAGE_NAV_WINDOW_SEC + PAGE_NAV_LIMITS.TTL_BUFFER_SEC,
        });
        return { allowed: true };
      }

      await kv.put(storageKey, JSON.stringify({ count: 1, windowStart: now }), {
        expirationTtl: PAGE_NAV_WINDOW_SEC + PAGE_NAV_LIMITS.TTL_BUFFER_SEC,
      });
      return { allowed: true };
    } catch (err) {
      // KV read/write gagal — fail-open: jangan pernah menolak navigasi
      // pengunjung sah karena infra limiter bermasalah.
      console.error("[pagenav-guard] KV gagal — fail-open:", err);
      return { allowed: true };
    }
  },
};

// ===== Fallback dev-only in-memory (identik behavior, tanpa KV) =====
const devGuard = (() => {
  const credMap = new Map<string, Entry>();
  const ipMap = new Map<string, Entry>();
  const lockMap = new Map<string, LockoutEntry>();

  return {
    async check(ip: string, email: string): Promise<LoginRateDecision> {
      const now = Date.now();
      const ipEntry = ipMap.get(KEY.loginIp + ip);
      if (ipEntry && inWindow(ipEntry, now) && ipEntry.count >= LOGIN_LIMITS.IP_MAX_FAILURES) {
        return { allowed: false, reason: "lockout", retryAfterSec: Math.ceil((ipEntry.windowStart + LOGIN_LIMITS.WINDOW_MS - now) / 1000) };
      }
      const lock = lockMap.get(KEY.loginLockout + `${ip}:${email}`);
      if (lock && lock.until > now) {
        return { allowed: false, reason: "lockout", retryAfterSec: Math.ceil((lock.until - now) / 1000) };
      }
      const credEntry = credMap.get(KEY.loginCred + `${ip}:${email}`);
      if (credEntry && inWindow(credEntry, now) && credEntry.count >= LOGIN_LIMITS.CRED_MAX_FAILURES) {
        return { allowed: false, reason: "lockout", retryAfterSec: Math.ceil((credEntry.windowStart + LOGIN_LIMITS.WINDOW_MS - now) / 1000) };
      }
      return { allowed: true };
    },
    async recordFailure(ip: string, email: string): Promise<void> {
      const now = Date.now();
      const ipKey = KEY.loginIp + ip;
      const ipEntry = ipMap.get(ipKey);
      ipMap.set(ipKey, ipEntry && inWindow(ipEntry, now)
        ? { count: ipEntry.count + 1, windowStart: ipEntry.windowStart }
        : { count: 1, windowStart: now });

      const credKey = KEY.loginCred + `${ip}:${email}`;
      const lockKey = KEY.loginLockout + `${ip}:${email}`;
      const credEntry = credMap.get(credKey);
      const nextCred = credEntry && inWindow(credEntry, now)
        ? { count: credEntry.count + 1, windowStart: credEntry.windowStart }
        : { count: 1, windowStart: now };

      if (nextCred.count >= LOGIN_LIMITS.CRED_MAX_FAILURES) {
        const prevLock = lockMap.get(lockKey);
        const level = prevLock ? prevLock.level + 1 : 1;
        const until = now + lockoutDurationMs(level);
        lockMap.set(lockKey, { level, until });
        credMap.set(credKey, { count: 0, windowStart: now });
      } else {
        credMap.set(credKey, nextCred);
      }
    },
    async recordSuccess(ip: string, email: string): Promise<void> {
      credMap.delete(KEY.loginCred + `${ip}:${email}`);
      lockMap.delete(KEY.loginLockout + `${ip}:${email}`);
    },
  };
})();
