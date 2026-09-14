# TASKS — Roadmap & Pelacakan Progres

Legenda: `[DONE]` selesai & terverifikasi · `[IN PROGRESS]` sedang berjalan
· `[TODO]` belum dimulai. Detail perubahan per fase: `CHANGELOG.md`.

## Fase 1 — Keamanan & Bug Kritis `[DONE]`

- [DONE] RLS `site_settings` 403 — script fix + diagnostik
  (`supabase/site-settings-policy-fix.sql`), sinkron `schema.sql` &
  `00-full-migration.sql`; pola subquery `profiles` dipertahankan
  (klaim `role` di JWT DITOLAK — tidak ada di JWT).
- [DONE] Path traversal `src/lib/storage.ts` — validasi shape UUID +
  `isSafeStoragePath()` (object storage, bukan `path.resolve`).
- [DONE] Bug `status_tidak_valid` — akar: ID HTML duplikat `p-status` di
  `ProjectForm.astro`; enum single source `PROJECT_STATUSES` + normalisasi API.
- [DONE] Verifikasi CSP produksi — `default-src` pertama, tanpa
  `unsafe-eval`/`unsafe-inline` (temuan scanner = false positive dev-server).
- [DONE] GitHub Actions hardening — `deploy.yml` & `sbom.yml` pinned ke SHA
  + `permissions` least-privilege di level job.
- Commit: `c36cf45`.

## Fase 2 — UI/UX & Fitur Baru

### Sudah selesai
- [DONE] CRUD Contact Messages — kolom `is_read` + policy UPDATE/DELETE (aal2
  + admin/editor), endpoint `api/admin/messages.ts`, halaman
  `/admin/messages` (tandai dibaca, hapus), nav admin. Commit: `d0b9eaa`.
  **Catatan ops:** `supabase/contact-messages-crud.sql` WAJIB dijalankan di
  SQL Editor sebelum fitur aktif di produksi.
- [DONE] Split pages Projects & Certificates — `/admin/projects` (list) +
  `/admin/projects/new` (form, edit via `?id=`); `/admin/certificates` +
  `/admin/certificates/new` pola sama; dashboard dirampingkan (KPI, quick
  actions, activity, status, peringatan kedaluwarsa, pesan kontak); nav
  view/add terpisah. Commit: `ea7cd04`.

### In progress
- [IN PROGRESS] **Supabase Keep-Alive** — workflow
  `.github/workflows/supabase-keep-alive.yml`, cron `0 0 */5 * *` (tiap
  5 hari), GET endpoint ringan produksi (`/` atau `/api/health` bila dibuat),
  `permissions: contents: read`. Tujuan: cegah auto-pause free tier.
- [IN PROGRESS] **Write-ups: status draft + metodologi kustom**
  - Kolom `status` (`draft`/`published`) di `writeups` (script migrasi +
    sinkron `00-full-migration.sql`); filter publik hanya menampilkan `published`.
  - Form admin: dropdown Draft/Published.
  - Metodologi: ganti dropdown hardcode menjadi input teks bebas
    (+ suggestions/datalist), kolom DB sudah `text` (cukup validasi UI).

## Fase 3 — Konten `[TODO]`

- [TODO] Isi case study / write-up baru (THM/HTB) melalui CMS.
- [TODO] Konten **Home Lab** — showcase lab rumahan (topologi, environment)
  disajikan via struktur project/write-up yang ada (lihat PRD §4).
- [TODO] Empty state handling — konsistenkan tampil "kosong" di semua
  halaman admin & widget publik (pola ada di messages/certificates).

## Backlog / Follow-up (di luar fase, dicatat agar tidak hilang)

- [DONE] Aksesibilitas P1 (hasil review UI/UX Sprint 4B):
  - Input admin `TerminalInput.astro` tanpa indikator fokus yang terlihat —
    diperbaiki lewat aturan `:focus-visible` NON-LAYER di `global.css`
    (menang atas semua utility `outline-none` di ±20 form, tanpa edit
    per-file) — WCAG 2.4.7.
  - Skip-link "Lewati ke konten utama" (i18n `ui.skipToContent`) ditambahkan
    di `MainLayout` & `AdminLayout`; `<main id="konten" tabindex="-1">`.
  - Blok `prefers-reduced-motion: reduce` di `global.css`: mematikan
    `type-effect` (dengan fallback teks utuh), `type-caret`, `badge-pulse`,
    `term-row`, transisi zoom/details, dan `scroll-behavior`.
- [TODO] Aksesibilitas P2 (susulan): pesan error API snake_case -> teks
  manusiawi di form admin, `aria-invalid` pada field gagal, teks `sr-only`
  untuk simbol `$`/`[✓]`, pengelompokan nav admin + badge unread messages.
- [TODO] Pin ke SHA workflow lain: `codeql.yml`, `db-backup.yml`,
  `data-retention.yml`, `dependency-review.yml` (hanya `deploy.yml` &
  `sbom.yml` yang sudah di-pin di Fase 1).
- [TODO] Migrasi API project ke `/api/admin/projects.ts` (TODO tercatat di
  `src/pages/api/projects.ts` — pemisahan read publik vs admin CRUD).
- [TODO] Perbarui dokumen G8 di `docs/SECURITY_COMPLIANCE_MAPPING.md`
  (klaim "login_attempts tanpa purge" sudah stale — ada RPC purge +
  `data-retention.yml`).
- [TODO] Opsional: viewer log audit (login_attempts / backup_config_access_log)
  di dashboard admin — policy SELECT admin sudah ada, belum terpakai UI.
- [TODO] Pertimbangkan batasi baca `contact_messages` (PII pengunjung)
  hanya admin/editor saat ini semua role login bisa baca.
