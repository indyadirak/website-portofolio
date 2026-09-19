# PROJECT_CONTEXT — Aturan Main & Memori Persisten AI

> Dokumen ini adalah **memori permanen** untuk sesi kerja berikutnya (AI developer
> maupun developer manusia). Baca SEBELUM menulis kode di repository ini.
> Jika konflik dengan insting/pola umum, **dokumen ini yang menang**.

## 1. Ringkasan Proyek

Portofolio profesional Cyber Security milik **Indy Adira Khalfani**
(produksi: `https://portofolio.indyadirak.my.id`). Situs publik berbasis bukti
(sertifikat terverifikasi, project dengan struktur Problem/Approach/Impact,
write-up CTF) + **Admin CMS** dengan MFA TOTP wajib dan RBAC tiga role.

| Area | Teknologi |
|---|---|
| Framework | Astro 7 (SSR untuk admin/API, prerender untuk sebagian publik) |
| Runtime | Cloudflare Workers (+ KV: rate limiting & session) |
| Styling | Tailwind CSS v4 (class utility; tanpa file CSS inline) |
| Bahasa | TypeScript strict |
| Backend | Supabase — Auth (TOTP/aal2), PostgreSQL (RLS), Storage (object) |
| Deploy | GitHub Actions → Cloudflare Workers (auto pada push `main`) |
| i18n | Indonesia (default, tanpa prefix) & English (`/en/*`) |

**Node.js ≥ 22.12** (lihat `engines` di package.json).

## 2. ATURAN EMAS (WAJIB — JANGAN DILANGGAR)

1. **CSP ketat.** DILARANG inline script & inline style. Semua `<script>` Astro
   di-bundle ke file eksternal. Jika script butuh data dari server, gunakan
   **data-attributes** pada elemen (pola: `data-i18n-*`, `data-proj-edit`,
   `data-project-json`). Pengecualian SAAT INI: `style-src 'unsafe-inline'`
   **hanya** di mode dev (middleware.ts, blok terdokumentasi) — Vite dev
   membutuhkan; production TIDAK BOLEH mempunyainya.
2. **RLS Supabase: role TIDAK PERNAH dari JWT.** DILARANG
   `auth.jwt() ->> 'role'` — klaim `role` tidak ada di JWT project ini
   (nilai NULL → policy tidak pernah lolos → 403 untuk semua user).
   WAJIB subquery ke `public.profiles`:
   ```sql
   exists (
     select 1 from public.profiles
     where profiles.id = auth.uid()
       and profiles.role in ('admin', 'editor')
   )
   ```
   Mutasi admin/editor selalu dikombinasikan
   `(select auth.jwt() ->> 'aal') = 'aal2'` (klaim `aal` inilah yang sah
   dibaca dari JWT). Pola referensi: `supabase/rbac-mfa.sql` (certificates)
   dan `supabase/site-settings-policy-fix.sql`.
3. **Supabase Storage = object storage, BUKAN filesystem.** DILARANG
   `path.resolve`/`path.join` untuk path storage. WAJIB: validasi regex +
   shape allowlist + penolakan segment `..`, path absolut, null byte,
   backslash (pola: `isSafeStoragePath()` di `src/lib/storage.ts`).
4. **Tidak ada ID HTML duplikat dalam satu halaman.** `getElementById`
   mengembalikan elemen PERTAMA — duplikat ID menyebabkan bug diam-diam
   (akar bug `status_tidak_valid` di Fase 1, kasus `p-status`).
   Konvensi: prefix spesifik per komponen (`p-`, `f-`, `msg-`, `l-`).
5. **i18n lengkap.** Semua teks UI baru HARUS masuk
   `src/lib/i18n/types.ts` + `id.ts` + `en.ts` (ketiganya typed, check
   akan gagal bila salah satu terlupa).
6. **Anti-500.** Query DB di halaman publik WAJIB try/catch dengan fallback
   (demo data / daftar kosong / KPI 0). Pola `safeQuery` di
   `src/pages/admin/dashboard.astro` adalah referensi.
7. **Verifikasi sebelum lapor.** Selalu `npm run check` dan `npm run build`
   hijau sebelum commit.
8. **Git commit.** Pesan commit TIDAK BOLEH mengandung karakter
   `&`, `"`, atau `/`. Contoh:
   `fix(security) fase 1 - RLS site settings, sanitasi path storage`.
9. **Dua kelas kunci Supabase.** Prefix `PUBLIC_` = publishable (masuk
   bundle, aman). Tanpa prefix = secret (hanya runtime Worker via
   `wrangler secret put`, TIDAK PERNAH di-commit). `service_role` hanya
   hidup server-side.
10. **SQL selalu sinkron dua arah.** Perubahan skema/policy: (a) file
    migrasi baru idempotent di `supabase/` untuk produksi, (b) sinkronkan
    kondisi akhir ke `supabase/schema.sql` (per-tabel) dan
    `supabase/00-full-migration.sql` (instalasi baru).

## 3. Akar Masalah Umum (Katalog Diagnostik)

| Gejala | Akar yang paling sering | Bukti/kasus |
|---|---|---|
| 403 pada mutasi admin | (a) Policy produksi memakai klaim JWT yang tidak ada (mis. `role`), (b) GRANT tabel hilang untuk `authenticated`, (c) sesi masih `aal1` (login lama sebelum MFA wajib) | Fase 1 TUGAS 1.1 — `supabase/site-settings-policy-fix.sql` punya section diagnostik 3 kandidat |
| Error validasi berulang dari form | ID HTML duplikat → `getElementById` salah elemen → state form rusak | Fase 1 TUGAS 1.3 — duplikat `p-status` (select vs paragraf pesan) |
| Path traversal di scanner | Path storage dibangun dari string user tanpa validasi shape | Fase 1 TUGAS 1.2 — `uploadCertificateFile`, `removeCertificateFile` |
| Sertifikat "Berlaku/Kedaluwarsa" basi | Badge dihitung **saat build** (halaman prerender) — deploy ulang untuk memperbarui | README §Fitur |
| Situs production "mati" | Supabase free tier auto-pause setelah ~7 hari tidak aktif | Solusi: workflow keep-alive (Fase 2, in-progress) |
| `status_tidak_valid` / enum API | Form mengirim nilai di luar enum DB CHECK constraint | Enum kanonik: `PROJECT_STATUSES` di `src/lib/types.ts` — identik CHECK constraint `supabase/schema.sql` |

## 4. Peta File Kritis

| Path | Fungsi |
|---|---|
| `src/middleware.ts` | Security headers (CSP sumber kebenaran runtime), rate limit navigasi, validasi session, guard `/admin` |
| `src/lib/auth.ts` | `createServerSupabase`, `hasRole` + helper `can*`, `resolveMfaStatus` |
| `src/lib/types.ts` | Semua domain type + type Database + **enum `as const`** (single source TS) |
| `src/lib/rateLimit.ts` | Semua limit & guard KV (login, MFA, backup-config, contact, admin mutasi) — fail-closed untuk endpoint sensitif |
| `src/lib/storage.ts` | Validasi upload (magic bytes) + validasi path object storage |
| `src/lib/i18n/` | `types.ts` (kontrak), `id.ts`, `en.ts` |
| `src/pages/api/` | Endpoint publik + `api/admin/*` (mutasi CMS) |
| `supabase/00-full-migration.sql` | Instalasi baru satu jalan |
| `supabase/*.sql` | Migrasi idempotent per fitur (untuk produksi) |
| `docs/DEPLOYMENT.md` | Checklist deploy (urutan SQL, secrets, verifikasi E2E) |
| `docs/SECURITY_COMPLIANCE_MAPPING.md` | Pemetaan kontrol ke ISO 27001 / NIST |
| `docs/PENDING_REVIEW_CHECKLIST.md` | Item review terbuka (BLOCKER vs PASCA-LIVE) |

## 5. Konvensi Tambahan

- **RBAC**: `viewer` (baca), `editor` (tulis konten + aal2), `admin`
  (tulis + hapus + halaman khusus `/admin/backup`, `/admin/cv` + aal2).
- **Pola halaman admin**: `AdminLayout` (sidebar desktop, drawer mobile, profile
  menu account, dan guard visual) → query SSR dengan try/catch →
  `TerminalTable`/`TerminalButton`/`TerminalInput` (`src/components/admin/ui/`)
  → script vanilla `<script>` Astro. Halaman login tetap memakai `MainLayout`.
- **Edit lintas halaman** (Fase 2): tombol edit di halaman list dispatch
  CustomEvent; dari halaman list event dikonversi jadi navigasi
  `?id=<uuid>` ke halaman form yang mem-prefill via seed `data-*`.
- **Demo data**: bila `PUBLIC_SUPABASE_*` belum di-set, situs publik tetap
  render dari `src/lib/data/` — sengaja, bukan bug.
- **Schema fitur terbaru**: database existing wajib menjalankan migrasi
  `projects-case-study.sql` dan `contact-messages-crud.sql` sebelum memakai
  field case study project atau aksi read/delete pesan.
- **CVE**: belum diimplementasikan; jangan menambahkan field CVE ke UI/DB tanpa
  migrasi idempotent, validasi, dan keputusan apakah project/write-up mendukung
  satu atau banyak CVE.
- **Jangan commit** `node_modules`, `dist`, `.env*`; secret hanya di
  GitHub Secrets + `wrangler secret put`.
