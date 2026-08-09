# DEPLOYMENT — Website Portofolio (Astro + Supabase + Cloudflare Workers)

> **DOKUMEN HIDUP — WAJIB DISINKRONKAN SETIAP PERUBAHAN.**
> Checklist ini wajib diperbarui setiap kali ada perubahan infrastruktur baru
> (tabel/RLS baru, secret baru, binding baru, layanan eksternal baru). Jika Anda
> menambah fitur yang memerlukan langkah manual (SQL, secret, setup eksternal),
> tambahkan langkahnya DI SINI sekaligus dalam commit fitur yang sama — jadikan
> sinkronisasi dokumen ini bagian rutin dari setiap penambahan fitur besar,
> bukan pekerjaan terpisah yang gampang terlupa.
>
> Sinkronisasi terakhir: commit `9e6da1b` (fitur Skills filter, Project
> P/S/I, image zoom, collapsible projects — migrasi `public-features.sql`).

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
- [ ] CV/Resume: upload via admin GUI (`/admin/cv` → bucket publik `cv`). Opsional fallback statis di `public/cv-id.pdf` & `public/cv-en.pdf` (bersihkan metadata PDF dengan exiftool; tanpa nomor telepon)

---

## 1. Database (Supabase) — kerjakan PERTAMA

- [ ] Jalankan SQL Editor **berurutan** (file di `supabase/`, semuanya idempotent — aman dijalankan ulang):
  - [ ] `schema.sql` (tabel proyek/skills — fondasi)
  - [ ] `rbac-mfa.sql` (profiles + certificates + RLS + trigger auto-profil — **wajib SEBELUM `storage.sql` & `cv.sql`**)
  - [ ] `contact.sql` (contact_messages + RLS + insert policy)
  - [ ] `storage.sql` (bucket sertifikat — **SETELAH `rbac-mfa.sql`**)
  - [ ] `login-attempts.sql` (audit login, RPC 5-param)
  - [ ] `backup-config.sql` (konfigurasi Drive, RLS aal2+admin)
  - [ ] `backup-config-access-log.sql` (audit endpoint backup-config)
  - [ ] `cv.sql` (bucket publik `cv` + tabel `cv_files` untuk upload CV via admin GUI — **SETELAH `rbac-mfa.sql`**)
  - [ ] `public-features.sql` (**migrasi fitur publik**: kolom `problem`/`solution`/`impact` di `projects`, kategori skills baru `Offensive Security`, RLS write projects untuk admin/editor — butuh `schema.sql` & `rbac-mfa.sql` sudah jalan; file ini wajib dijalankan bila memulai dari repo ini pasca commit `9e6da1b`)
  - [ ] **Urutan = urutan eksekusi**. Jangan menukar: `storage.sql` & `cv.sql` mensyaratkan `rbac-mfa.sql`; `public-features.sql` mensyaratkan `schema.sql` + `rbac-mfa.sql`.
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

### Secrets (11)

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
| `SUPABASE_SERVICE_ROLE_KEY` | service_role Supabase (paling berkuasa — hanya server-side) |
| `BACKUP_FETCH_TOKEN` | Token acak gate `/api/backup-config` — nilai yang SAMA otomatis disalin ke Worker oleh deploy.yml |
| `GDRIVE_CONFIG_ENCRYPTION_SECRET` | Kunci AES-256-GCM ≥ 32 byte (enkripsi-at-rest key SA Drive) |

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
npx wrangler deploy

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
- [ ] `/admin/dashboard` → `[ cv ]` → upload CV/Resume PDF per bahasa (id & en) — tombol unduh di navbar/hero otomatis menunjuk ke file terbaru di bucket publik `cv`; fallback ke `public/cv-*.pdf` bila belum di-upload
- [ ] (Opsional) Cek status key SA: `https://www.googleapis.com/auth/drive.file` aktif di IAM

## 7. Verifikasi end-to-end

- [ ] `curl -I https://<worker-url>/` → 200 + header `Content-Security-Policy`, `Strict-Transport-Security` ada
- [ ] Form kontak: submit dengan Turnstile → masuk ke `contact_messages`; tanpa Turnstile → ditolak
- [ ] **Login lockout**: 3× password salah (IP+email sama) → ke-4 balas `429 too_many_attempts`; cek tabel `login_attempts` (status `blocked` + `blocked_reason`, email NULL)
- [ ] **Backup-config rate limit**: 5× `curl -X POST -H "Authorization: Bearer salah" <worker>/api/backup-config` → ke-6 `429`; token benar → 200 `{configured:true}`; cek `backup_config_access_log`
- [ ] **Backup mingguan**: Actions → Database Backup → Run workflow → step Drive hijau + log `[gdrive] upload OK: backup-<tanggal>.sql.gpg`
- [ ] File muncul di folder Drive (ber-timestamp, tidak menimpa); file > 12 minggu otomatis terhapus
- [ ] **Restore test**: download artifact + file Drive → `gpg --decrypt --passphrase "<BACKUP_ENCRYPTION_KEY>"` menghasilkan `.sql` yang valid
- [ ] Jadwal cron aktif: Minggu 02:00 UTC

## 8. Operasional

- [ ] Rotasi: `TURNSTILE_SECRET_KEY` / `BACKUP_FETCH_TOKEN` / `GDRIVE_CONFIG_ENCRYPTION_SECRET` → update GitHub secret → run deploy.yml (secret disalin otomatis ke Worker). **Catatan**: rotasi `GDRIVE_CONFIG_ENCRYPTION_SECRET` membuat key SA yang tersimpan tidak bisa didekripsi → simpan ulang via GUI setelah rotasi
- [ ] Backup berjalan otomatis tiap Minggu — tidak perlu tindakan kecuali ada failure alert di Actions
- [ ] **Update dokumen ini** setiap ada perubahan infrastruktur baru
