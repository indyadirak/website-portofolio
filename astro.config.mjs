// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  // TODO: ganti dengan domain produksi (dipakai untuk canonical & og:url)
  site: 'https://example.com',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  i18n: {
    locales: ['id', 'en'],
    defaultLocale: 'id',
    // Strategi manual: i18n hanya menyediakan helper (getRelativeLocaleUrl, dll).
    // Astro TIDAK memaksa 404/redirect pada URL tanpa prefix locale
    // (mis. /admin/*, /api/*), karena strategi prefix-default mengharuskan
    // SEMUA halaman memakai prefix locale dan sisanya diberi 404.
    // Redirect root "/" -> "/id/" ditangani src/pages/index.astro.
    routing: 'manual',
  },
  build: {
    // CSP ketat (public/_headers) tanpa 'unsafe-inline' style-src:
    // semua stylesheet harus berupa file eksternal, tidak di-inline.
    inlineStylesheets: 'never',
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
