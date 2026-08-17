import type { APIRoute } from "astro";
import { siteConfig } from "../lib/config";
import { getProjects } from "../lib/data/projects";

export const prerender = true;

/**
 * Sitemap dinamis (generated saat build) — endpoint preradered:
 *   - Daftar halaman statis publik (Beranda, Proyek, Sertifikat, Tentang,
 *     Kontak) dihitung manual dari daftar route di src/pages.
 *   - Halaman detail project di-ambil DINAMIS dari Supabase (getProjects)
 *     — slug baru otomatis masuk sitemap tanpa edit manual.
 *   - Sertifikat TIDAK punya halaman detail — hanya halaman list-nya yang
 *     masuk (data sertifikat tidak menambah URL).
 *   - Eksklusi: /admin, /api, halaman error (404/403/429/500) — bukan
 *     halaman publik & dilarang di robots.txt.
 *   - Format multi-bahasa standar: tiap entry dilengkapi <xhtml:link
 *     rel="alternate" hreflang> untuk versi id ("id" tanpa prefix, sesuai
 *     prefixDefaultLocale: false) dan en (prefix /en/), plus x-default.
 */
const site = siteConfig.url.replace(/\/+$/, "");

/** Halaman statis publik (path relatif; "" = beranda). */
const STATIC_PATHS = ["", "projects", "certificates", "about", "contact", "privacy"] as const;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** URL ber-trailing-slash per locale (konsisten dengan canonical di MainLayout). */
function localeUrl(locale: "id" | "en", path: string): string {
  if (path === "") return locale === "en" ? `${site}/en/` : `${site}/`;
  return locale === "en" ? `${site}/en/${path}/` : `${site}/${path}/`;
}

function entryXml(path: string): string {
  const idUrl = localeUrl("id", path);
  const enUrl = localeUrl("en", path);
  return `<url>
  <loc>${escapeXml(idUrl)}</loc>
  <xhtml:link rel="alternate" hreflang="id" href="${escapeXml(idUrl)}" />
  <xhtml:link rel="alternate" hreflang="en" href="${escapeXml(enUrl)}" />
  <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(idUrl)}" />
</url>`;
}

export const GET: APIRoute = async () => {
  const projects = await getProjects();
  const projectPaths = projects.map((p) => `projects/${encodeURIComponent(p.slug)}`);

  const entries = [...STATIC_PATHS, ...projectPaths].map(entryXml);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};