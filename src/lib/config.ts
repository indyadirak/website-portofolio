import { env } from "cloudflare:workers";

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
  url: "https://portfolio.indyadirak.my.id",

  author: {
    name: "Indy Adira Khalfani",
    role: "Cyber Security Specialist",
    /** Institusi pendidikan (JSON-LD alumniOf). Kosongkan ("") untuk skip. */
    alumniOf: "",
  },

  contact: {
    /** Email utama — TIDAK dirender polos di HTML (lihat EmailLink.astro). */
    email: "indyadira@indyadirak.my.id",
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

/**
 * Cloudflare Turnstile (anti-bot form kontak).
 * - siteKey  : publik, dirender di widget (aman untuk frontend, boleh
 *              ter-inline saat build)
 * - secretKey: server-only — dibaca dari RUNTIME (wrangler secret put),
 *              TIDAK pernah ikut di-bake ke bundle build (mencegah bocor
 *              lewat build artifact / log CI, dan rotasi cukup update
 *              secret tanpa rebuild). Dev lokal: fallback import.meta.env
 *              (.env) agar `npm run dev` tetap jalan tanpa binding.
 * Jika siteKey kosong, Turnstile dinonaktifkan (mode dev) dan form/API
 * berjalan tanpa CAPTCHA.
 */
export const turnstile = {
  siteKey: (import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined) ?? "",
};

export function getTurnstileSecretKey(): string {
  if (env.TURNSTILE_SECRET_KEY) return env.TURNSTILE_SECRET_KEY;
  if (import.meta.env.DEV) {
    return (import.meta.env.TURNSTILE_SECRET_KEY as string | undefined) ?? "";
  }
  return "";
}
