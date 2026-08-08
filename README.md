# Website Portfolio — Cyber Security

Portfolio website Cyber Security yang dibangun dengan **Astro** + **Tailwind CSS v4** + **Supabase**, dilengkapi **Admin CMS** dengan autentikasi multi-faktor (MFA) dan kontrol akses berbasis peran (RBAC).

## Fitur

- **Landing page portfolio**: hero, featured projects, skills, about, contact (demo data + integrasi Supabase)
- **Admin CMS** (`/admin`): login 3 langkah — password → MFA 6 digit → enroll QR (TOTP)
- **Manajemen sertifikat**: CRUD lengkap dengan **upload file** (PDF/PNG/JPG/WebP/GIF, maks 5 MB)
- **Validasi upload server-side**: verifikasi magic bytes — file spoofing (ekstensi bohong) ditolak
- **RBAC**: `admin` / `editor` / `viewer` — akses menu menyesuaikan peran
- **MFA wajib (`aal2`)** untuk peran `admin`/`editor` — diberlakukan di RLS database, bukan hanya UI
- **Keamanan**: CSP ketat tanpa `unsafe-inline`, security headers (Cloudflare Workers), RLS di semua tabel
- **SSR**: halaman admin & API di-render server-side (Astro + Cloudflare Workers)

## Tech Stack

| Area        | Teknologi                                   |
| ----------- | ------------------------------------------- |
| Framework   | Astro 7 (SSR, Cloudflare Workers)          |
| Styling     | Tailwind CSS v4                             |
| Bahasa      | TypeScript (strict)                         |
| Backend     | Supabase (Auth, Postgres, Storage)          |
| Keamanan    | Supabase MFA/TOTP, RLS, CSP, magic bytes    |

## Struktur Project

```
├── .env.example               # contoh variabel environment
├── astro.config.mjs
├── wrangler.toml               # konfigurasi Cloudflare Workers (KV, deploy)
├── public/
│   └── _headers               # security headers fallback (aset statis murni; utama di middleware)
├── src/
│   ├── components/
│   │   ├── admin/             # CertificateForm, CertificateList, MfaEnrollPanel
│   │   ├── Hero.astro, SkillGrid.astro, ProjectGrid.astro, ...
│   ├── layouts/BaseLayout.astro
│   ├── lib/                   # auth.ts, storage.ts, supabase.ts, types, data/
│   ├── middleware.ts          # validasi session + guard /admin
│   ├── pages/
│   │   ├── admin/             # login.astro, dashboard.astro
│   │   └── api/               # auth/*, certificates, certificates/upload
│   └── styles/global.css
└── supabase/
    └── *.sql                  # skema, RLS/RBAC+MFA, storage, audit (urutan: docs/DEPLOYMENT.md §1)
```

## Prasyarat

- Node.js >= 22.12
- Akun [Supabase](https://supabase.com) (free tier cukup)

## Setup

```bash
# 1. Install dependensi
npm install

# 2. Salin contoh env
cp .env.example .env
# isi PUBLIC_SUPABASE_URL dan PUBLIC_SUPABASE_ANON_KEY

# 3. Jalankan SQL di Supabase SQL Editor (urut):
#    lihat docs/DEPLOYMENT.md §1 — schema → rbac-mfa → storage → sisanya (audit/backup)

# 4. Jalankan dev server
npm run dev
```

Buka `http://localhost:4321` — halaman publik memakai demo data jika env Supabase belum diisi. `/admin` hanya berfungsi setelah Supabase dikonfigurasi.

> **Catatan**: user admin dibuat via Supabase Dashboard (Authentication → Users), lalu atur `role = 'admin'` di tabel `public.profiles` (lihat docs/DEPLOYMENT.md §1). MFA di-enroll pada login pertama; role `admin`/`editor` wajib `aal2`.

## Scripts

| Script           | Fungsi                                  |
| ---------------- | --------------------------------------- |
| `npm run dev`    | Dev server (port 4321)                  |
| `npm run build`  | Build produksi (dist/)                  |
| `npm run preview`| Preview hasil build                     |
| `npm run check`  | Type checking + diagnostics (astro check) |

## Deployment

- **Cloudflare Workers** (SSR + static assets): push ke `main` auto-deploy via GitHub Actions (`.github/workflows/deploy.yml`), atau manual dengan `wrangler deploy`.
- Pastikan environment variables Supabase di-set (PUBLIC_* via secrets, non-publik sebagai runtime secrets Worker).
- Checklist lengkap (SQL, KV, secrets): [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Keamanan

Lihat [SECURITY.md](SECURITY.md) untuk kebijakan pelaporan kerentanan. Garis besar:

- RLS sebagai penegak izin utama (MFA `aal2` + role)
- Cek role di API hanya defense-in-depth
- Upload: allowlist MIME + magic bytes + limit ukuran + path acak + rollback file yatim saat DB gagal
- CSP tanpa `unsafe-inline` script/style — semua style & script harus file eksternal

## Lisensi

Belum ditentukan.
