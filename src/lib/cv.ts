import { CV_BUCKET, cvStoragePath, type CvLocale } from "./storage";
import { isSupabaseConfigured } from "./supabase";
import { siteConfig } from "./config";
import type { Locale } from "./i18n";

/**
 * URL unduhan CV untuk locale tertentu.
 *
 * - Supabase dikonfigurasi: URL publik storage dengan path STABIL
 *   (`cv-<locale>.pdf`) + param `?download=` agar browser memaksa
 *   unduhan (Content-Disposition: attachment — `download` attribute
 *   HTML tidak berfungsi untuk URL cross-origin).
 *   Karena path tetap & di-upsert, URL ini SELALU mengembalikan file
 *   CV terbaru dari storage — tidak perlu versi di URL.
 * - Supabase belum dikonfigurasi (dev/demo): fallback path statis
 *   `public/cv-<locale>.pdf` dari siteConfig.
 *
 * Halaman publik situs di-prerender saat build; fungsi ini sengaja
 * SINKRON dan bebas query DB agar URL dapat di-bake ke HTML tanpa
 * bergantung pada state database pada saat build.
 */
export function resolveCvUrl(locale: Locale): string {
  if (isSupabaseConfigured) {
    const file = cvStoragePath(locale as CvLocale);
    return `${import.meta.env.PUBLIC_SUPABASE_URL}/storage/v1/object/public/${CV_BUCKET}/${file}?download=${file}`;
  }
  return siteConfig.cv[locale];
}
