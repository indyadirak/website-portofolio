import type { Locale } from "./i18n";

/**
 * Konfigurasi terpusat situs — SEMUA info identitas & kontak diubah di sini,
 * jangan hardcode di komponen lain.
 */

/** Status ketersediaan: 'open-to-work' | 'not-available'. */
export type AvailabilityStatus = "open-to-work" | "not-available";

export const siteConfig = {
  /** Nama situs / brand. */
  name: "CyberSec",
  /** Domain produksi (ganti saat deploy; dipakai untuk canonical & og:url). */
  url: "https://example.com",

  author: {
    name: "Your Name",
    role: "Cyber Security Specialist",
    /** Institusi pendidikan (JSON-LD alumniOf). Kosongkan ("") untuk skip. */
    alumniOf: "",
  },

  contact: {
    /** Email utama — TIDAK dirender polos di HTML (lihat EmailLink.astro). */
    email: "hello@example.com",
    /** LinkedIn boleh tampil sebagai link biasa — memang untuk dibagikan. */
    linkedinUrl: "https://linkedin.com/in/your-username",
    githubUrl: "https://github.com/your-username",
    availabilityStatus: "open-to-work" satisfies AvailabilityStatus,
  },

  /**
   * Path file CV per bahasa. Sediakan file di public/:
   *   - public/cv-id.pdf (Bahasa Indonesia)
   *   - public/cv-en.pdf (English)
   * NOTE: jangan cantumkan nomor telepon di CV — cukup email & LinkedIn,
   * dan bersihkan metadata PDF (exiftool) sebelum di-upload.
   */
  cv: {
    id: "/cv-id.pdf",
    en: "/cv-en.pdf",
  },
} as const;

export type SiteConfig = typeof siteConfig;

/** URL CV sesuai bahasa aktif situs. */
export function cvUrl(locale: Locale): string {
  return locale === "en" ? siteConfig.cv.en : siteConfig.cv.id;
}

/**
 * Cloudflare Turnstile (anti-bot form kontak).
 * - siteKey  : publik, dirender di widget (aman untuk frontend)
 * - secretKey: server-only, dipakai verifikasi token di /api/contact
 * Jika keduanya kosong, Turnstile dinonaktifkan (mode dev) dan
 * form/API berjalan tanpa CAPTCHA.
 */
export const turnstile = {
  siteKey: (import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined) ?? "",
  secretKey: (import.meta.env.TURNSTILE_SECRET_KEY as string | undefined) ?? "",
};

export const isTurnstileEnabled = Boolean(turnstile.siteKey && turnstile.secretKey);
