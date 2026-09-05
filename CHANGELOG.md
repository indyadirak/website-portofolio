# CHANGELOG — Riwayat Perubahan Penting

Format: `Fase/Versi — deskripsi (commit)`. Riwayat lengkap: `git log`.
Hanya perubahan struktural/keamanan/fitur besar yang dicatat di sini.

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
