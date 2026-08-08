import type { Dictionary } from "./i18n/types";
import { id } from "./i18n/id";
import { en } from "./i18n/en";

/** Locale yang didukung situs — wajib sinkron dengan `i18n.locales` di astro.config.mjs. */
export const locales = ["id", "en"] as const;

export type Locale = (typeof locales)[number];

export const dictionaries: Record<Locale, Dictionary> = { id, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "id" || value === "en";
}

export function otherLocale(locale: Locale): Locale {
  return locale === "id" ? "en" : "id";
}

/**
 * Mengekstrak locale dari pathname URL.
 * Strategi: id = default TANPA prefix, en = prefix /en/.
 * - "/en/about/" -> "en"
 * - "/about/", "/", "/admin/login", "/api/contact" -> null (artinya id)
 */
export function localeFromPathname(pathname: string): Locale | null {
  const match = pathname.match(/^\/(en)(?:\/|$)/);
  return match ? (match[1] as Locale) : null;
}

/** Locale aktif untuk sebuah URL; default ke "id" bila tanpa prefix. */
export function localeFromUrl(url: URL): Locale {
  return localeFromPathname(url.pathname) ?? "id";
}
