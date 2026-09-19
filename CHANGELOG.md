# CHANGELOG — Riwayat Perubahan Penting

Format: `Fase/Versi — deskripsi (commit)`. Riwayat lengkap: `git log`.
Hanya perubahan struktural/keamanan/fitur besar yang dicatat di sini.

## Unreleased — Final QA & Fase 3

### Public UX dan Admin Workspace
- Homepage dipadatkan menjadi alur positioning → featured projects → skills →
  contact CTA; Operations Log/System Status tidak lagi menginterupsi alur utama.
- Header public dipangkas dengan memindahkan Security ke footer; footer sekarang
  menyediakan identity block, CTA kontak, legal/security, social links, dan status.
- Easter egg console production dihapus agar tidak ada output dekoratif/debug pada
  browser console.
- AdminLayout diubah menjadi sidebar desktop + drawer mobile dengan grouping,
  profile menu account, status MFA, role visibility, dan logout terpusat.
- Halaman CV, backup, dan form write-up dimigrasikan dari MainLayout ke AdminLayout.
- MFA enrollment diperkuat untuk cleanup faktor unverified, variasi payload QR
  Supabase, dan persistensi sesi AAL2.
- `npm run check`, `npm run build`, dan `npm audit --omit=dev` berhasil bersih.
- Audit mobile seluruh route publik/admin selesai: grid dan form memiliki
  breakpoint, tabel memakai overflow/card fallback, modal memakai viewport-safe
  sizing, dan admin content tidak lagi mendapat padding horizontal ganda.
- Sidebar admin desktop diperbaiki agar sticky tepat di bawah header, sehingga
  tidak menimpa topbar pada viewport tablet/desktop.
- Migrasi one-shot database existing ditambahkan di
  `supabase/99-existing-database-sync.sql`.

### Fase 3 — Evidence-based content dan UX publik
- Empty state publik diperbaiki agar tidak menampilkan command debug atau
  `total 0`; pesan Projects, Certificates, dan Skills sekarang profesional
  serta terlokalisasi.
- Blok `<pre><code>` write-up diberi styling terminal yang responsif:
  monospace, background gelap, padding, border, `white-space: pre`, dan
  horizontal scroll untuk ASCII Art Home Lab.
- Riwayat versi sebelumnya: Operations Log homepage pernah mengambil empat
  pengalaman terbaru dari
  tabel `experiences`, sehingga sinkron dengan Career Timeline di About.
- Career Timeline mendukung tampilan nested untuk promosi atau peran berurutan
  pada perusahaan yang sama.
- About dinamis melalui `site_settings`: bio, specializations JSON, dan contact
  info dapat dikelola dari Admin Settings.
- Social Links mendukung nama platform bebas, icon class, dan URL gambar custom.

### Fase 2 — Write-up dan infrastructure completion
- Keep-alive Supabase ditambahkan melalui `/api/health` dan workflow cron lima
  hari dengan least-privilege permissions.
- Write-up mendukung status `draft`/`published` dengan trigger sinkronisasi
  legacy `is_published`; halaman publik hanya membaca status published.
- Metodologi write-up menggunakan input bebas dengan datalist suggestions.
- README proyek diperbarui untuk mendokumentasikan evidence-based portfolio,
  security posture, arsitektur, dan cara menjalankan lokal.

### Security hardening dan QA
- `fast-uri` diperbarui melalui `npm audit fix`; audit dependency menjadi nol
  vulnerability.
- Header COEP `credentialless` ditambahkan pada middleware dan static headers.
- HSTS diselaraskan menjadi `max-age=31536000; includeSubDomains; preload`.
- Minimum TLS 1.2 di Cloudflare Edge didokumentasikan sebagai konfigurasi zone,
  bukan perubahan kode aplikasi.
- `security.txt` runtime dan fallback static menggunakan expiry tetap
  `06 September 2027`.
- Skrip `scripts/local-audit.mjs` dan `AUDIT_REPORT.md` ditambahkan untuk smoke
  test headers, public API exposure, unauthenticated admin requests, dan route
  availability.
- Contact form Turnstile diperkuat dengan `getResponse()`, FormData standar,
  dan submit button yang baru aktif setelah callback CAPTCHA berhasil.
- Seed demo `supabase/seed-data.sql` ditambahkan untuk contoh Home Lab dan
  sertifikat agar instalasi tidak kosong.

## Fase 2 — Peningkatan Admin UX & Fitur (2026-09)

### `ea7cd04` — Split halaman list & form Projects/Certificates
- Route baru: `/admin/projects` (list) + `/admin/projects/new` (form;
  mode edit via `?id=<uuid>` dengan prefill seed `data-*` → event
  `project:edit` yang sudah ada).
- Route baru: `/admin/certificates` (list) + `/admin/certificates/new`
  (pola sama, event `certificate:edit`).
- Dashboard dirampingkan: section form & list project/certificates
  dipindahkan; quick actions kini menautkan ke route baru; KPI,
  recent activity, system status, peringatan kedaluwarsa, dan pesan
  kontak tetap di dashboard.
- Navigasi admin: 4 link terpisah — view/add projects, view/add
  certificates (i18n `navViewProjects`, `navAddProjects`,
  `navViewCertificates`, `navAddCertificates`).
- Endpoint API tidak berubah (POST/PUT tetap `/api/projects`,
  `/api/certificates` + `/api/certificates/upload`).

### `d0b9eaa` — CRUD Contact Messages
- SQL: kolom `is_read` + policy UPDATE/DELETE `contact_messages`
  (aal2 + admin/editor via subquery `profiles`) + grant —
  `supabase/contact-messages-crud.sql` (produksi), sinkron
  `schema.sql` & `00-full-migration.sql`.
- API: `PUT`/`DELETE` `/api/admin/messages?id=<uuid>` — guard session +
  role + `adminMutationGuard` (fail-closed), validasi UUID, 404 bila
  tidak ditemukan.
- UI: halaman `/admin/messages` — `TerminalTable`, tombol tandai dibaca
  & hapus (confirm), highlight unread, update in-place, nav admin.
- Helper RBAC `canManageMessages()`; i18n section `adminMessages`.

## Fase 1 — Perbaikan Kritis Keamanan & Bug (2026-09)

### `c36cf45` — RLS, path traversal, bug status, pin workflow
- **RLS site_settings (403)**: `supabase/site-settings-policy-fix.sql` —
  diagnostik 3 akar (policy klaim-role di produksi, GRANT hilang, sesi
  aal1) + recreate policy insert/update (aal2 + subquery `profiles` +
  `with check`) + re-grant. Penolakan eksplisit `auth.jwt() ->> 'role'`
  (klaim tidak ada di JWT → NULL → 403 semua user). Sinkron ke
  `schema.sql` & `00-full-migration.sql`.
- **Path traversal storage**: validasi shape UUID + regex ketat path di
  `uploadCertificateFile`, validasi `isSafeStoragePath()` di
  `removeCertificateFile` (path dari DB), runtime guard locale di
  `cvStoragePath` — semua fail-closed. Catatan arsitektur: object
  storage bukan filesystem (`path.resolve` tidak aplikabel).
- **Bug `status_tidak_valid`**: akar = **ID HTML duplikat `p-status`**
  (select & paragraf pesan) → `getElementById` salah elemen → option
  select terhapus saat render status → submit berikutnya mengirim
  status kosong. Fix: rename `p-status-msg`, enum single source
  `PROJECT_STATUSES` (identik CHECK constraint DB), normalisasi
  trim+lowercase di API, fallback `selectedIndex === -1`, cast tipe
  yang benar (ganti `as never`).
- **CSP**: diverifikasi bersih di produksi — `default-src 'self'` di
  awal, tanpa `unsafe-eval`, `style-src 'unsafe-inline'` hanya dev
  (disengaja, terdokumentasi) → tidak ada perubahan kode.
- **GitHub Actions**: `deploy.yml` (checkout v5.1.0, setup-node v4.4.0)
  & `sbom.yml` (checkout v5.1.0, sbom-action v0.24.2) di-pin ke SHA
  (diverifikasi `git ls-remote`) + `permissions` least-privilege level job.

## Prasejarah (sebelum Fase 1) — ringkas

| Commit | Perubahan |
|---|---|
| `2998b75` | Kategori project DINAMIS (B2) — FK `project_categories`, seed 14, CRUD admin, filter publik |
| `2f93593` | CMS write-ups terstruktur (case study THM/HTB) |
| `8b14abb` | `security.txt` dinamis (RFC 9116) + halaman arsitektur keamanan |
| `6fa18b1` | Empty state sertifikat + redesign dashboard command center |
| `0d60740` | Turnstile siteverify server-side (remoteip) + reset widget saat gagal |
| `6ec0e56` | Site settings: experiences & social links dinamis (Fase 2 CMS) |
| `5b6e717` | Homepage & about publik disambungkan ke data dinamis (Fase 3) |
| `37b5d70` | Redesign dashboard, fix timeout MFA |
