import type { Locale } from "./i18n";

/**
 * Path og:image untuk sebuah halaman publik.
 *
 * Gambar TIDAK dibuat oleh route Astro (adapter Cloudflare me-render
 * prerender di workerd yang tidak punya filesystem Node), melainkan oleh
 * scripts/generate-og.mjs sebagai langkah `postbuild`: skrip memindai HTML
 * hasil build, membaca og:title/og:description/og:url, lalu menulis PNG
 * 1200x630 ke dist/client/og/... . Semua tetap build-time & statis.
 *
 * Fungsi ini HARUS konsisten dengan path yang ditulis skrip tersebut.
 *
 * Contoh: ogImagePath("id", "projects") -> /og/id/projects.png
 *         ogImagePath("en", "project", slug) -> /og/en/project/<slug>.png
 */
export function ogImagePath(locale: Locale, page: string, slug?: string): string {
  const segments = slug ? [locale, page, slug] : [locale, page];
  return `/og/${segments.map((segment) => encodeURIComponent(segment)).join("/")}.png`;
}
