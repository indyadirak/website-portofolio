import { siteConfig } from "../../lib/config";

export const prerender = false;

/**
 * security.txt dinamis — RFC 9116 (https://www.rfc-editor.org/rfc/rfc9116).
 * Alih-alih file statis di public/, endpoint ini memastikan nilai (kontak,
 * kebijakan, canonical, expires) selalu sinkron dengan config.ts.
 * Respons text/plain dengan cache 24 jam — bukan dokumen HTML/JS, jadi CSP
 * middleware tidak berdampak (browser mengabaikan CSP pada non-document).
 */
export function GET(): Response {
  const base = siteConfig.url;
  const expires = new Date();
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);

  const body = [
    `# Security contact for ${siteConfig.name}`,
    `# Domain: ${new URL(base).host}`,
    "# Pelaporan kerentanan mengikuti RFC 9116 dan kebijakan keamanan situs.",
    "",
    `Contact: ${base}${siteConfig.security.contactUrl}`,
    `Encryption: ${base}${siteConfig.security.pgpKeyUrl}`,
    `Policy: ${base}/security`,
    "Preferred-Languages: id, en",
    `Canonical: ${base}/.well-known/security.txt`,
    `Expires: ${expires.toUTCString()}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "max-age=86400",
    },
  });
}