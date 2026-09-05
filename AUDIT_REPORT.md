# Final QA & Red Team Audit Report

## Scope

Audit statis terhadap `src/pages/api`, `src/lib`, dan `src/components`, serta
skrip smoke test lokal untuk environment development. Audit ini tidak mencoba
menebak kredensial, tidak mengubah data, dan tidak melakukan destructive test.

## Temuan

### Validasi Ulang Hasil Local Audit

Tiga kegagalan awal perlu diklasifikasikan sebagai masalah kondisi audit,
bukan celah autentikasi:

- **CSP:** saat `npm run dev`, middleware sengaja mengizinkan
  `style-src 'unsafe-inline'` untuk Vite HMR dan Astro Dev Toolbar. Skrip
  default sekarang melaporkan ini sebagai expected dev behavior. Untuk audit
  production preview, gunakan `AUDIT_STRICT_HEADERS=1`.
- **Site Settings HTTP 503:** terjadi ketika `locals.supabase` belum tersedia
  karena environment Supabase belum dikonfigurasi lokal. Route berhenti sebelum
  auth guard; ini bukan bypass authorization. Gunakan
  `AUDIT_REQUIRE_SUPABASE=1` agar mode strict mengharuskan respons 401/403 dan
  menganggap 503 sebagai kegagalan konfigurasi.
- **Projects HTTP 404:** `/api/admin/projects` memang bukan route yang ada.
  Endpoint project yang benar adalah `/api/projects`; skrip sudah diperbaiki.

Dengan demikian, hasil awal tidak menunjukkan celah autentikasi. Namun, auth
guard baru benar-benar tervalidasi bila audit dijalankan dengan Supabase lokal
yang dikonfigurasi.

### Critical

Tidak ditemukan pada audit statis.

### High

Tidak ditemukan endpoint mutasi admin yang jelas melewati guard aplikasi.
Endpoint admin yang diperiksa memakai kombinasi session, role helper, dan
`adminMutationGuard`; RLS database menjadi enforcement lapisan kedua.

`/api/backup-config` bukan endpoint CMS biasa. Endpoint tersebut memakai
Bearer token runtime, timing-safe comparison, rate limiting, dan audit log.

### Medium

- **Public API contract perlu dipantau:** `/api/projects` dan `/api/writeups`
  tidak menyediakan public GET collection. Akses GET diharapkan `404` atau
  `405`, bukan `2xx`. Skrip lokal memasukkan ini sebagai regression check.
- **IDOR model CMS:** admin/editor memang dapat mengubah record berdasarkan
  UUID karena CMS ini single-owner, bukan multi-tenant. Ini bukan IDOR lintas
  user dalam model saat ini, tetapi bila proyek berubah menjadi multi-tenant,
  setiap record perlu `owner_id` dan policy ownership.
- **Contact PII:** pesan kontak dapat dibaca semua authenticated role sesuai
  policy saat ini. Review privacy lanjutan disarankan bila role `viewer`
  diberikan kepada pihak selain owner.
- **Static audit link coverage:** route yang dibangun secara dinamis atau URL
  eksternal tidak dapat dipastikan seluruhnya hanya dari source grep. Smoke
  route check mencakup route publik utama.

### Low

- Beberapa label legacy pada halaman admin masih berupa string langsung. Tidak
  memengaruhi public security boundary, tetapi dapat dirapikan pada sweep i18n
  berikutnya.
- Hasil `astro check` dapat menampilkan hint dari artefak build lama jika
  direktori backup build berada di workspace. Artefak tersebut tidak boleh
  di-commit.

### UX Improvement

- Tambahkan health check production terjadwal ke monitoring eksternal selain
  keep-alive Supabase.
- Tambahkan assertion CI bahwa public endpoints tidak mengembalikan field
  draft atau secret.
- Pertimbangkan membatasi pembacaan `contact_messages` menjadi admin/editor
  bila viewer akan dipakai untuk akun non-owner.

## Cara Menjalankan Local Red Team Script

1. Jalankan dev server sesuai instruksi project.
2. Pada terminal lain, jalankan:

```bash
node scripts/local-audit.mjs
```

Base URL default adalah `http://localhost:4321`. Untuk URL lokal berbeda:

```bash
AUDIT_BASE_URL=http://localhost:4322 node scripts/local-audit.mjs
```

Script memeriksa:

- CSP, HSTS, X-Frame-Options, dan COEP `credentialless`.
- Tidak adanya public GET collection yang tidak disengaja.
- Draft marker pada respons public API.
- POST/PUT/DELETE admin tanpa session harus `401` atau `403` ketika Supabase
  tersedia; 503 lokal berarti konfigurasi belum siap.
- Status `200` untuk `/`, `/about`, `/projects`, dan `/contact`.

Exit code bukan nol berarti ada regression yang perlu diperiksa.

## Action Plan

1. Jalankan script pada dev server dan simpan output sebagai baseline release.
2. Jalankan ulang setelah setiap perubahan middleware, RLS, API, atau routing.
3. Jika public API check menerima `2xx`, pastikan endpoint tersebut memang
   sengaja publik dan tidak mengembalikan draft, PII, secret, atau admin data.
4. Tambahkan script ini ke workflow QA sebelum deployment bila stabil.
5. Review ulang akses baca `contact_messages` sebelum membuat role viewer untuk
   pengguna eksternal.
6. Jalankan dependency audit secara berkala dan tindak lanjuti alert high atau
   critical sebelum release.

## Audit Strict Production Preview

Untuk menghindari false positive dev CSP dan memastikan guard auth benar-benar
teruji, jalankan production preview dengan environment Supabase lokal yang
valid:

```bash
AUDIT_STRICT_HEADERS=1 AUDIT_REQUIRE_SUPABASE=1 node scripts/local-audit.mjs
```
