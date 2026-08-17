// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  // Domain produksi (dipakai untuk canonical & og:url)
  site: 'https://portofolio.indyadirak.my.id',
  output: 'server',
  // Cloudflare Pages (workerd). Bindings (KV, secrets) diakses via
  // `import { env } from "cloudflare:workers"` — lihat src/env.d.ts.
  // Konfigurasi binding lokal & deploy CLI: wrangler.toml.
  adapter: cloudflare(),
  i18n: {
    locales: ['id', 'en'],
    defaultLocale: 'id',
    // prefixDefaultLocale: false -> strategi "pathname-prefix-other-locales":
    //   id = default, TANPA prefix di URL (/about, /, /projects/...)
    //   en = ber-prefix /en/ (/en/about, /en/, /en/projects/...)
    // Lebih baik untuk SEO halaman utama bahasa Indonesia.
    // Halaman admin & api berada di root tanpa prefix dan tidak tersentuh
    // oleh middleware i18n (tidak mengandung segment locale).
    routing: { prefixDefaultLocale: false },
  },
  build: {
    // CSP ketat (public/_headers) tanpa 'unsafe-inline' style-src:
    // semua stylesheet harus berupa file eksternal, tidak di-inline.
    inlineStylesheets: 'never',
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Astro auto-inline script chunks yang lebih kecil dari limit ini
      // (default 4096) — script inline diblokir CSP ketat (script-src 'self'
      // tanpa 'unsafe-inline'). Kecilkan ke 0 agar SEMUA script menjadi
      // file eksternal /_astro/*.js (begitu juga aset lain yang di-import).
      assetsInlineLimit: 0,
    },
  }
});
