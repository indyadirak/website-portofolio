# DEPLOYMENT — Website Portofolio (Astro + Supabase + Cloudflare Workers)

> **DOKUMEN HIDUP — WAJIB DISINKRONKAN SETIAP PERUBAHAN.**
> Checklist ini wajib diperbarui setiap kali ada perubahan infrastruktur baru
> (tabel/RLS baru, secret baru, binding baru, layanan eksternal baru). Jika Anda
> menambah fitur yang memerlukan langkah manual (SQL, secret, setup eksternal),
> tambahkan langkahnya DI SINI sekaligus dalam commit fitur yang sama — jadikan
> sinkronisasi dokumen ini bagian rutin dari setiap penambahan fitur besar,
> bukan pekerjaan terpisah yang gampang terlupa.
>
> Sinkronisasi terakhir: public UX, Admin Workspace, dan MFA hardening
> — halaman `/privacy` (id/en), rate limit MFA, step CI `npm audit` +
> verifikasi security headers pasca-deploy, workflow SBOM, workflow retensi
> data mingguan, dokumen RTO/RPO & retensi (§8), README urutan migrasi
> dikoreksi (rbac-mfa pertama).

Versi infrastruktur saat ini:
- Runtime: **Cloudflare Workers (Static Assets)** — adapter `@astrojs/cloudflare`
- Database: **Supabase** (Postgres + Auth + RLS + MFA TOTP)
- Rate limiting & lockout: **Cloudflare KV** (`RATE_LIMIT_KV` — id asli sudah
  terpasang di `wrangler.toml`, lihat §2)
- Backup: workflow GitHub Actions mingguan → artifact GitHub (30 hari) + **Google Drive** (3-2-1, retensi 12 minggu, konfigurasi via GUI admin)
- Node: **24** (kedua workflow GitHub Actions dipin eksplisit)

---

## 0. Prasyarat & identitas

- [ ] Node.js ≥ 22.12 (disarankan 24) terpasang; `npm ci` berjalan lokal tanpa error
- [ ] Akun: GitHub, Cloudflare (dengan Workers), Supabase (project aktif), Google (untuk Service Account Drive)
- [ ] `src/lib/config.ts` (siteConfig): isi `name`, `url` (domain asli), `author`, `contact` (email/LinkedIn/GitHub), `availabilityStatus`
- [ ] `astro.config.mjs`: `site` = domain produksi (dipakai untuk canonical & og:url — jangan biarkan placeholder `https://example.com`)
- [ ] CV/Resume: upload via admin GUI (`/admin/cv` → bucket publik `cv`). Opsional fallback statis di `public/cv-id.pdf` & `public/cv-en.pdf` (bersihkan metadata PDF dengan exiftool; tanpa nomor telepon)

---

## 1. Database (Supabase) — kerjakan PERTAMA

- [ ] **Opsi A — TERCEPAT (disarankan untuk fresh install / re-sync penuh):** jalankan SATU file `supabase/00-full-migration.sql` di SQL Editor. Isinya gabungan SEMUA migrasi + `BEGIN;`/`COMMIT;` — jika ada satu statement gagal, semua otomatis rollback (tidak ada perubahan setengah jalan). Idempotent penuh (CREATE IF NOT EXISTS, DROP POLICY IF EXISTS, `ON CONFLICT DO NOTHING`) — aman dijalankan berulang, termasuk di database yang sudah ter-migrasi sebagian.
- [ ] **Opsi B — database existing (disarankan untuk schema dump lama):** backup database, lalu jalankan satu file `supabase/99-existing-database-sync.sql`. File ini idempotent dan menyinkronkan kolom case study project, `contact_messages.is_read`, RLS, grants, dan schema cache PostgREST tanpa menghapus data.
- [ ] **Opsi C — bertahap (untuk patch/migrasi tambahan di masa depan):** jalankan file terpisah SATU PER SATU **hanya yang belum pernah dijalankan** (semuanya idempotent — aman dijalankan ulang):
  - [ ] `rbac-mfa.sql` (profiles + certificates + RLS + trigger auto-profil) — **WAJIB PALING AWAL**: `schema.sql`, `storage.sql`, `cv.sql`, `login-attempts.sql`, `backup-config.sql`, `backup-config-access-log.sql` dan `public-features.sql` semuanya membuat policy/subquery yang mereferensikan `public.profiles` — jika belum ada, `CREATE POLICY` gagal (42P01, ekspresi policy divalidasi saat dibuat)
  - [ ] `schema.sql` (tabel proyek/skills/contact_messages — **SETELAH `rbac-mfa.sql`**: policy write projects mereferensikan `profiles`)
  - [ ] `contact.sql` (migrasi kolom `subject` lama — **SETELAH `schema.sql`**)
  - [ ] `storage.sql` (bucket sertifikat — **SETELAH `rbac-mfa.sql`**)
  - [ ] `login-attempts.sql` (audit login, RPC 5-param — **SETELAH `rbac-mfa.sql`**)
  - [ ] `backup-config.sql` (konfigurasi Drive, RLS aal2+admin — **SETELAH `rbac-mfa.sql`**)
  - [ ] `backup-config-access-log.sql` (audit endpoint backup-config — **SETELAH `rbac-mfa.sql`**)
  - [ ] `cv.sql` (bucket publik `cv` + tabel `cv_files` — **SETELAH `rbac-mfa.sql`**)
   - [ ] `public-features.sql` (kolom `problem`/`solution`/`impact` di projects, kategori skills, RLS write projects — **SETELAH `schema.sql` + `rbac-mfa.sql`**)
   - [ ] `projects-case-study.sql` (kolom `methodology`/`attack_path`/`detection` — **SETELAH `schema.sql`**)
   - [ ] `contact-messages-crud.sql` (kolom `is_read` + policy UPDATE/DELETE — **SETELAH `schema.sql`**)
  - [ ] `certificates-category.sql` (kategori Compliance/Training — **butuh `rbac-mfa.sql`**; data lama otomatis `'training'`)
  - [ ] `certificates-verification-url.sql` (kolom `verification_url` — **butuh `rbac-mfa.sql`**; NULL = tanpa badge)
  - [ ] `certificates-issue-date.sql` (kolom `issue_date` WAJIB + `DEFAULT CURRENT_DATE`; backfill NULL dari `created_at`)
  - [ ] `certificates-expiry-date.sql` (kolom `expiry_date` nullable)
  - [ ] `certificates-featured.sql` (kolom `is_featured boolean not null default false` — pola sama `featured` di `projects`)
  - [ ] `certificates-short-description.sql` (kolom `short_description_id`/`short_description_en` nullable — pola dua-kolom-per-bahasa sama Problem/Solution/Impact di projects)
  - [ ] **Urutan = urutan eksekusi** (urutan Opsi B = urutan section dalam `00-full-migration.sql`). Jangan menukar: semuanya mensyaratkan `rbac-mfa.sql` lebih dulu (tabel `profiles` & `certificates`); `public-features.sql` juga mensyaratkan `schema.sql`.
- [ ] **Buat admin user**: Authentication → Users → Add user (email + password kuat). Wajib: set `role = 'admin'` di tabel `public.profiles` dan `mfa_enforced = true` (dashboard atau SQL) — tanpa role admin, GUI backup & audit tidak bisa diakses
- [ ] Catat dari Project Settings → API: `URL` + `anon` key + `service_role` key
- [ ] Catat dari Project Settings → Database → Connection string: **SESSION POOLER (port 5432)** — untuk pg_dump (jangan Transaction Pooler 6543), tambahkan `?sslmode=require`

## 2. Cloudflare — KV & token

- [ ] **KV namespace `RATE_LIMIT_KV`**: id **ASLI** sudah terpasang di `wrangler.toml` (rate limiting login/backup-config AKTIF). Hanya perlu dibuat ulang jika pindah akun/project Cloudflare:
  ```
  npx wrangler kv namespace create RATE_LIMIT_KV
  ```
  lalu salin `id` hasil perintah ke `wrangler.toml` (ganti placeholder `"<id>"`). **Guard otomatis**: deploy.yml memblokir deploy selama id placeholder masih ada — agar kasus "silent inert" (rate limiter tampak normal tapi tidak pernah membatasi) tidak pernah terlewat.
- [ ] Buat API token dengan permission minimal: **Workers Scripts: Edit**, **KV: Edit**, **Account Settings: Read** → simpan sebagai `CLOUDFLARE_API_TOKEN`; `CLOUDFLARE_ACCOUNT_ID` dari dashboard
- [ ] (Opsional) Custom domain: Workers → worker → Settings → Triggers → Custom Domains

## 3. GitHub — Secrets & Variables

GitHub → Settings → Secrets and variables → Actions.

### Secrets (12)

| Secret | Nilai |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token dari poin 2 |
| `CLOUDFLARE_ACCOUNT_ID` | ID akun Cloudflare |
| `PUBLIC_SUPABASE_URL` | URL project Supabase |
| `PUBLIC_SUPABASE_ANON_KEY` | anon key (publik — dibutuhkan build) |
| `PUBLIC_TURNSTILE_SITE_KEY` | Site key Turnstile (publik) |
| `TURNSTILE_SECRET_KEY` | Secret key Turnstile (dashboard Cloudflare) |
| `SUPABASE_DB_URL` | SESSION POOLER + `?sslmode=require` (untuk pg_dump) |
| `BACKUP_ENCRYPTION_KEY` | Passphrase GPG enkripsi backup (acak) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role Supabase (paling berkuasa — hanya server-side). Format legacy `eyJ...` ATAU baru `sb_secret_...` — kode endpoint backup-config sudah kompatibel dua-duanya (header `apikey` saja) |
| `BACKUP_FETCH_TOKEN` | Token acak gate `/api/backup-config` — nilai yang SAMA otomatis disalin ke Worker oleh deploy.yml |
| `GDRIVE_CONFIG_ENCRYPTION_SECRET` | Kunci AES-256-GCM ≥ 32 byte (enkripsi-at-rest key SA Drive) |
| `CMS_DEPLOY_TOKEN` | PAT GitHub untuk trigger rebuild otomatis dari CMS (lihat §10) |

Generate nilai acak (PowerShell):
```powershell
# BACKUP_FETCH_TOKEN & GDRIVE_CONFIG_ENCRYPTION_SECRET:
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Max 256 }) -as [byte[]])
```

> **Filosofi kunci**: `PUBLIC_*` di tabel ini adalah key *publishable* (aman
> ter-expose ke build/browser — anon key beroperasi di bawah RLS), sedangkan
> sisanya *secret* sejati yang hanya boleh hidup sebagai runtime secret Worker.
> Penjelasan lengkap & tabel padanan: **README.md → 🗝️ Filosofi Keamanan Kunci API**.

### Variables (1)

| Variable | Nilai |
|---|---|
| `BACKUP_CONFIG_URL` | URL worker, mis. `https://website-portofolio.<subdomain>.workers.dev` (atau custom domain) — dipakai workflow untuk mengambil konfigurasi Drive dari GUI |

### Legacy (opsional — hanya bila tidak memakai GUI admin)
- [ ] `GDRIVE_SERVICE_ACCOUNT_KEY` (JSON key SA, base64 satu baris) + `GDRIVE_BACKUP_FOLDER_ID` — masih didukung sebagai fallback, tapi GUI admin adalah jalur utama

## 4. Google — Service Account & Drive

- [ ] Google Cloud Console: buat project → enable **Google Drive API**
- [ ] IAM & Admin → Service Accounts → buat SA → **Keys → Add Key → JSON** (download; jangan commit/share)
- [ ] Google Drive: buat folder khusus (mis. `website-backups`) → Share → email SA (`<name>@<project>.iam.gserviceaccount.com`) → role **Editor** (biarkan General access = Restricted)
- [ ] Catat folder ID (bagian URL setelah `/folders/`) — akan diisi di GUI admin

## 5. Deploy pertama

Dua jalur — fungsinya identik, pilih salah satu:

### Jalur A — GitHub Actions (disarankan, sekali setup)

- [ ] `git push origin main` → workflow **Deploy to Cloudflare Workers** hijau
- [ ] Setelah hijau: verifikasi runtime secret terpasang (harus ada 5):
  `npx wrangler secret list` → `TURNSTILE_SECRET_KEY`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_FETCH_TOKEN`, `GDRIVE_CONFIG_ENCRYPTION_SECRET`

### Jalur B — Deploy manual (tanpa GitHub Actions)

Build lalu deploy dari mesin lokal (tidak butuh secret GitHub apa pun — secret
dipasang langsung ke Worker):

```powershell
# 1. Build produksi (butuh PUBLIC_* env saat build — anon key PUBLIK,
#    boleh di .env; TURNSTILE_SECRET_KEY opsional saat build, dipasang
#    sebagai runtime secret di langkah 3)
npm run build

# 2. Deploy ke Cloudflare Workers
# (config lengkap worker + assets ada di dist/server/wrangler.json —
#  jangan `wrangler deploy` tanpa argumen: wrangler.toml root hanya untuk dev)
npx wrangler deploy dist/server/wrangler.json

# 3. Pasang runtime secrets (nilai SAMA dengan tabel §3)
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put BACKUP_FETCH_TOKEN
npx wrangler secret put GDRIVE_CONFIG_ENCRYPTION_SECRET
```

> Runtime secret TIDAK pernah ikut di-bundle ke `dist/` — hanya build-time
> `PUBLIC_*` yang masuk bundle (aman: anon key memang publik).
> Catatan: `SUPABASE_URL` adalah salinan `PUBLIC_SUPABASE_URL` (URL bukan
> rahasia) — di-ekspos sebagai secret hanya karena `env.SUPABASE_URL` dibaca
> server-side di endpoint backup-config.

- [ ] Turnstile widget aktif di dashboard Cloudflare (site key match dengan secret)

## 6. Admin & konfigurasi backup

- [ ] Buka `/admin/login` → login admin pertama → **enroll MFA TOTP** (wajib untuk admin)
- [ ] `/admin/dashboard` → `[ backup ]` → paste JSON key SA + folder ID Drive → **simpan** (status ter-mask: email SA & tail folder ID tampil)
- [ ] Admin workspace: sidebar desktop/drawer mobile, profile menu account, role badge,
      status MFA, dan logout berfungsi; CV/backup hanya tampil untuk role `admin`
- [ ] `/admin/dashboard` → `[ cv ]` → upload CV/Resume PDF per bahasa (id & en) — tombol unduh di navbar/hero otomatis menunjuk ke file terbaru di bucket publik `cv`; fallback ke `public/cv-*.pdf` bila belum di-upload
- [ ] (Opsional) Cek status key SA: `https://www.googleapis.com/auth/drive.file` aktif di IAM

## 7. Verifikasi end-to-end

- [ ] `curl -I https://<worker-url>/` → 200 + header `Content-Security-Policy`, `Strict-Transport-Security` ada
- [ ] `curl -I https://<worker-url>/certificates/` → 200 + header CSP/HSTS/nosniff/XFO **juga** ada (halaman prerender dilayani sebagai static asset — header dari `_headers`, bukan middleware; diverifikasi 17-08-2026 via workerd lokal)
      **Catatan akurasi badge**: `/certificates` & `/en/certificates` di-prerender saat build (`prerender = true`) — status "Berlaku/Kedaluwarsa" akurat **per tanggal build/deploy**, bukan per kunjungan. Redeploy untuk memperbarui; tidak perlu tindakan lain.
- [ ] `curl https://<worker-url>/sitemap.xml` → XML berisi halaman statis + detail project + `hreflang` id/en/x-default; pastikan `robots.txt` memuat baris `Sitemap:`
- [ ] `/certificates` & `/en/certificates`: filter Compliance/Training berfungsi; sertifikat ber-`verification_url` menampilkan badge "Lihat Sertifikat Asli", sisanya tanpa link; sertifikat `is_featured` tampil paling atas dengan badge "Featured"; sertifikat ber-`expiry_date` di masa depan menampilkan badge hijau "Berlaku hingga …", yang sudah lewat menampilkan badge amber "Kedaluwarsa …", tanpa `expiry_date` tidak ada badge; `short_description_id/en` tampil sebagai 1–2 baris di bawah judul (per locale)
- [ ] Form kontak: submit dengan Turnstile → masuk ke `contact_messages`; tanpa Turnstile → ditolak
- [ ] **Login lockout**: 3× password salah (IP+email sama) → ke-4 balas `429 too_many_attempts`; cek tabel `login_attempts` (status `blocked` + `blocked_reason`, email NULL)
- [ ] **Backup-config rate limit**: 5× `curl -X POST -H "Authorization: Bearer salah" <worker>/api/backup-config` → ke-6 `429`; token benar → 200 `{configured:true}`; cek `backup_config_access_log`
- [ ] **Backup mingguan**: Actions → Database Backup → Run workflow → step Drive hijau + log `[gdrive] upload OK: backup-<tanggal>.sql.gpg`
- [ ] File muncul di folder Drive (ber-timestamp, tidak menimpa); file > 12 minggu otomatis terhapus
- [ ] **Restore test**: download artifact + file Drive → `gpg --decrypt --passphrase "<BACKUP_ENCRYPTION_KEY>"` menghasilkan `.sql` yang valid
- [ ] Jadwal cron aktif: Minggu 02:00 UTC
- [ ] **Security headers (CI otomatis)**: step "Verify security headers (production)" di deploy.yml lolos (CSP, HSTS, nosniff, X-Frame-Options wajib ada)

## 8. Kebijakan pemulihan & retensi (RTO/RPO)

Target yang dianut project ini (dokumentasi, bukan kontrak):

| Metrik | Target | Basis |
|---|---|---|
| **RPO** (Recovery Point Objective) | ≤ 7 hari | Backup otomatis tiap Minggu 02:00 UTC; kehilangan data maksimal 1 minggu terakhir |
| **RTO** (Recovery Time Objective) | ≤ 1 hari | Restore: `gpg --decrypt` + `psql` ke project Supabase baru + `npx wrangler deploy` — prosedur & runbook restore ada di §7 checklist ini |

- [ ] **Drill restore (minimal 1× per 3 bulan)**: jalankan penuh langkah berikut ke **project Supabase sementara** lalu catat hasilnya di bawah:
      1. Unduh artifact terbaru (`Actions → Database Backup → artifact`) atau file `.gpg` dari Drive
      2. Dekripsi + restore + verifikasi baris — otomatis oleh skrip:
         `$env:BACKUP_ENCRYPTION_KEY="..."; $env:TARGET_DB_URL="postgresql://...scratch..."; .\scripts\restore-test.ps1` → target `RESTORE TEST: PASS`
      3. Manual (alternatif bila tanpa skrip): `gpg --batch --yes --decrypt --passphrase "<BACKUP_ENCRYPTION_KEY>" -o backup.sql backup.sql.gpg` lalu `psql "$SESSION_POOLER_URL_DUMP_TARGET" -f backup.sql` (bisa sebagian per-tabel bila perlu)
      4. Verifikasi: jumlah baris `projects`/`certificates`/`contact_messages` > 0; tabel `profiles` isi ulang manual (backup skema `public` saja — user auth milik Supabase)
      5. Catat tanggal drill & hasil: **drill terakhir: — / hasil: —**
- [ ] **Retensi data** (ditegakkan otomatis oleh workflow `data-retention.yml`, Senin 03:00 UTC):
      - `contact_messages` (PII pengunjung): **12 bulan** sejak `created_at`
      - `login_attempts` & `backup_config_access_log` (audit): **90 hari** sejak `attempted_at`
      - Backup artefak GitHub: **30 hari**; salinan Drive: **12 minggu**
- [ ] Kebijakan privasi pengunjung dipublikasikan di `/privacy` & `/en/privacy` (link footer) — sinkronkan isi (retensi 12 bulan, 90 hari, 12 minggu) bila angka di atas berubah

### 8.1 Pemulihan akses admin — ponsel (TOTP) hilang/rusak

Skenario: aplikasi authenticator tidak bisa diakses → login admin terkunci di lapisan MFA aplikasi.

**Yang TIDAK hilang**: akses ke **data** tetap terbuka lewat jalur alternatif — Dashboard Supabase (login email/password, tanpa MFA aplikasi) dan backup GPG terenkripsi. Runbook ini hanya memulihkan **akses ke CMS/Worker app**.

- [ ] **Jalur GUI** (disarankan): `https://supabase.com/dashboard` → project → **Authentication → Users** → pilih user admin → tab **Factors** → hapus faktor TOTP yang ada
       → logout/login ulang di `/admin/login` → enrollment MFA baru melalui panel
         login (QR baru)
- [ ] **Jalur SQL** (bila GUI faktor tidak tersedia): SQL Editor →
      ```sql
      select id, user_id, factor_type, created_at from auth.mfa_factors;
      -- lalu hapus faktor baris admin (ganti <factor-id>):
      delete from auth.mfa_factors where id = '<factor-id>';
      ```
      lalu login ulang + enroll ulang seperti jalur GUI
- [ ] **Pencegahan**: simpan QR/secret TOTP cadangan di password manager saat enroll pertama — **recovery codes belum diimplementasikan** (gap terbuka, lihat laporan §4.1)
- [ ] Role `viewer` tidak terpengaruh (tidak butuh MFA); rate limiter Worker tidak membatasi jalur pemulihan ini karena lewat Dashboard, bukan Worker

## 9. Operasional

- [ ] Rotasi: `TURNSTILE_SECRET_KEY` / `BACKUP_FETCH_TOKEN` / `GDRIVE_CONFIG_ENCRYPTION_SECRET` → update GitHub secret → run deploy.yml (secret disalin otomatis ke Worker). **Catatan**: rotasi `GDRIVE_CONFIG_ENCRYPTION_SECRET` membuat key SA yang tersimpan tidak bisa didekripsi → simpan ulang via GUI setelah rotasi
- [ ] Backup berjalan otomatis tiap Minggu — tidak perlu tindakan kecuali ada failure alert di Actions
- [ ] **Update dokumen ini** setiap ada perubahan infrastruktur baru

## 10. Rebuild otomatis setelah perubahan konten CMS

Halaman publik di-prerender saat build — tanpa rebuild, project/sertifikat/
write-up baru tidak muncul di website. Sejak versi ini, setiap mutasi konten
yang sukses (projects, certificates, write-ups, categories, site-settings,
experiences, social-links, cv) otomatis meminta rebuild via `POST`
`workflow_dispatch` ke workflow Deploy (lihat `src/lib/deploy.ts`).

Aturan main:

- Cooldown **10 menit** via KV (`deploy:last-trigger`): edit 10 item
  beruntun = 1 deploy, bukan 10.
- Gagal trigger TIDAK menggagalkan penyimpanan konten — cek log Worker
  (`[deploy-trigger]`) lalu pakai tombol Publish manual.
- Tombol **Publish Website** di `/admin/dashboard` (admin saja, AAL2)
  memicu rebuild manual dengan cooldown yang sama.

Setup sekali (wajib agar auto-rebuild aktif):

- [ ] GitHub → Settings → Developer settings → **Personal access tokens →
      Fine-grained tokens** → Generate new token:
      - Repository access: **Only select repositories** →
        `indyadirak/website-portofolio`
      - Permissions → **Actions: Read and write**
      - Expiration: 1 tahun (catat tanggal rotasi)
- [ ] GitHub repo → Settings → Secrets and variables → Actions → New
      repository secret: `CMS_DEPLOY_TOKEN` = token di atas
- [ ] Push/`workflow_dispatch` deploy.yml sekali — step
      "Set CMS_DEPLOY_TOKEN secret (runtime)" menyalinnya ke Worker.
      Verifikasi: `npx wrangler secret list` memuat `CMS_DEPLOY_TOKEN`.
- [ ] Uji: tambah project test → tunggu ±3 menit → cek halaman publik.
      Hapus project test setelahnya (ikut memicu 1 rebuild, dalam cooldown).

Rotasi: buat PAT baru → update GitHub secret `CMS_DEPLOY_TOKEN` →
run deploy.yml (disalin otomatis ke Worker seperti secret lain).
