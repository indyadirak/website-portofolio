<div align="center">

# 🛡️ Website Portofolio — Cyber Security

Portfolio website untuk profesional **Cyber Security**, dibangun di atas **Astro** + **Tailwind CSS v4** + **Supabase**, dilengkapi **Admin CMS** dengan autentikasi multi-faktor (MFA) dan kontrol akses berbasis peran (RBAC).

[![Astro](https://img.shields.io/badge/Astro-7-FF5D01?logo=astro&logoColor=white)](https://astro.build)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![License](https://img.shields.io/badge/License-MIT-brightgreen?style=flat-square)](LICENSE)

</div>

---

## 📑 Daftar Isi

- [Fitur](#-fitur)
- [Tech Stack](#-tech-stack)
- [Struktur Project](#-struktur-project)
- [Cara Menjalankan](#-cara-menjalankan)
- [Scripts](#-scripts)
- [Deployment](#-deployment)
- [Keamanan](#-keamanan)
- [Lisensi](#-lisensi)

---

## ✨ Fitur

### 🌐 Situs Publik
- **Landing page portfolio** — hero, featured projects, skills, about, contact, **halaman Sertifikat** (`/certificates`, `/en/certificates`) dengan filter kategori Compliance/Training
- **Dukungan 2 bahasa (i18n)** — Indonesia (default, tanpa prefix) & English (`/en/*`)
- **Sitemap dinamis** — `/sitemap.xml` (route statis + detail project dari Supabase, hreflang id/en/x-default) + `Sitemap:` di robots.txt
- **Badge verifikasi sertifikat** — link "Lihat Sertifikat Asli" ke halaman verifikasi issuer (`verification_url`)
- **Badge masa berlaku (Berlaku/Kedaluwarsa)** — dihitung **saat build** (halaman sertifikat di-prerender, `prerender = true`): akurasi badge = tanggal build/deploy terakhir, bukan waktu kunjungan pengunjung. Deploy ulang untuk memperbarui status.
- **Demo data bawaan** — situs tetap tampil utuh sebelum Supabase dikonfigurasi
- **Form kontak anti-bot** — proteksi [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/)
- **Link Blog eksternal** — `blog.indyadirak.my.id` (Blogger) di navbar & footer, tab baru + ikon external-link

### 🔐 Admin CMS (`/admin`)
- **Login 3 langkah** — password → kode MFA 6 digit → enroll QR (TOTP)
- **Manajemen sertifikat** — CRUD lengkap dengan upload file (PDF/PNG/JPG/WebP/GIF, maks 5 MB), kategori Compliance/Training, dan URL verifikasi opsional (`verification_url`)
- **Validasi upload server-side** — verifikasi *magic bytes*; file dengan ekstensi bohong ditolak
- **RBAC** — `admin` / `editor` / `viewer`; akses menu menyesuaikan peran
- **MFA wajib (`aal2`)** untuk role `admin`/`editor` — diberlakukan di RLS database, bukan hanya UI
- **Manajemen CV/Resume** — upload PDF per bahasa (id/en) dari GUI; tombol unduh di situs otomatis menunjuk file terbaru
- **Backup konfigurasi** — kelola kredensial & target backup dari GUI admin

### 🛡️ Keamanan
- **RLS di semua tabel** — izin data dipaksa di level database
- **CSP ketat** tanpa `unsafe-inline` — semua style & script file eksternal (pengecualian: `style-src 'unsafe-inline'` **hanya** di mode dev agar Vite HMR / Astro Dev Toolbar berfungsi; production tetap ketat)
- **Security headers** di middleware (runtime), `public/_headers` sebagai fallback aset statis
- **Brute-force protection** — rate limit + lockout bertingkat per IP/email
- **Audit trail** — percobaan login & akses kredensial dicatat

### 🚀 Infrastruktur
- **SSR penuh** — halaman admin & API di-render server-side (Cloudflare Workers)
- **Backup 3-2-1** — otomatis mingguan via GitHub Actions, enkripsi GPG, offload Google Drive

---

## 🧰 Tech Stack

| Area        | Teknologi                                                       |
| ----------- | --------------------------------------------------------------- |
| Framework   | [Astro 7](https://astro.build) (SSR, Cloudflare Workers)        |
| Styling     | [Tailwind CSS v4](https://tailwindcss.com)                      |
| Bahasa      | TypeScript (strict)                                             |
| Backend     | Supabase — Auth (MFA/TOTP), Postgres (RLS), Storage             |
| Runtime     | Cloudflare Workers + KV (rate limiting, sessions)               |
| Deploy      | GitHub Actions → Cloudflare Workers (auto-deploy on `main`)     |

---

## 📁 Struktur Project

```
.
├── .env.example               # contoh variabel environment
├── astro.config.mjs           # konfigurasi Astro (adapter, i18n, build)
├── wrangler.toml              # konfigurasi Cloudflare Workers (KV, deploy)
├── public/
│   └── _headers               # security headers fallback (aset statis)
├── src/
│   ├── components/            # Navbar, Hero, SkillGrid, ProjectGrid, admin/, ...
│   ├── layouts/               # MainLayout (head, nav, footer)
│   ├── lib/                   # auth, supabase, rateLimit, i18n, config, storage, cv, audit, api, data
│   ├── middleware.ts          # security headers + rate limit + validasi session + guard /admin
│   ├── pages/
│   │   ├── index.astro, about, certificates, projects, contact, 404/403/429/500   # publik (id & en/)
│   │   ├── admin/             # login, dashboard, backup, cv
│   │   └── api/               # auth/*, certificates (+upload), contact, projects, backup-config, admin/cv
│   └── styles/global.css
├── supabase/
│   └── *.sql                  # skema, RLS/RBAC+MFA, storage, audit
├── docs/
│   └── DEPLOYMENT.md          # checklist deploy lengkap (SQL → secrets → verifikasi)
└── .github/workflows/         # deploy, codeql, dependency-review, db-backup
```

---

## 🚀 Cara Menjalankan

### Prasyarat

- **Node.js ≥ 22.12** ([download](https://nodejs.org))
- Akun **Supabase** — [free tier](https://supabase.com/pricing) sudah cukup

### Quickstart

```bash
# 1. Install dependensi
npm install

# 2. Salin contoh env lalu isi kredensial Supabase
cp .env.example .env

# 3. Jalankan SQL di Supabase SQL Editor
#    Urutan wajib — lihat docs/DEPLOYMENT.md §1
#    (rbac-mfa PERTAMA → schema → storage → sisanya; atau sekali jalan
#    pakai file gabungan supabase/00-full-migration.sql)

# 4. Jalankan dev server
npm run dev
```

Buka **http://localhost:4321** 🎉

> **Catatan** — Halaman publik memakai demo data jika env Supabase belum diisi.
> `/admin` hanya berfungsi setelah Supabase dikonfigurasi.
>
> User admin dibuat via **Supabase Dashboard** (Authentication → Users), lalu set
> `role = 'admin'` di tabel `public.profiles` (detail: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §1).
> MFA di-enroll pada login pertama; role `admin`/`editor` wajib `aal2`.

---

## 📜 Scripts

| Script            | Fungsi                                            |
| ----------------- | ------------------------------------------------- |
| `npm run dev`     | Jalankan dev server (port 4321, hot-reload)       |
| `npm run build`   | Build produksi (output Worker di `dist/`)         |
| `npm run preview` | Preview hasil build secara lokal                  |
| `npm run check`   | Type checking + diagnostics (`astro check`)       |

---

## ☁️ Deployment

Dua opsi — keduanya mengarah ke **Cloudflare Workers** (SSR + static assets):

| Opsi                    | Cara                                                                |
| ----------------------- | ------------------------------------------------------------------- |
| **Auto (disarankan)**   | Push ke `main` → GitHub Actions deploy otomatis (`.github/workflows/deploy.yml`) |
| **Manual**              | `npx wrangler deploy dist/server/wrangler.json` setelah `npm run build` |

**Sebelum deploy**: pastikan environment variables Supabase di-set
(`PUBLIC_*` via secrets, non-publik sebagai runtime secrets Worker), dan ikuti
checklist lengkap di **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — SQL, KV namespace,
secrets GitHub, hingga verifikasi E2E.

---

## 🔒 Keamanan

Kebijakan pelaporan kerentanan lengkap: **[SECURITY.md](SECURITY.md)**

Garis besar pertahanan berlapis:

| Lapisan          | Mekanisme                                                            |
| ---------------- | -------------------------------------------------------------------- |
| **Database**     | RLS sebagai penegak izin utama — MFA `aal2` + role di level Postgres |
| **API**          | Cek role & session di server (defense-in-depth, bukan satu-satunya)  |
| **Upload**       | Allowlist MIME + magic bytes + limit 5 MB + path acak + rollback file yatim |
| **Transport**    | CSP tanpa `unsafe-inline` + security headers di middleware           |
| **Auth**         | MFA TOTP wajib, rate limit & lockout anti brute-force, audit trail   |
| **Backup**       | Enkripsi GPG + AES-256-GCM at-rest, rotasi kredensial, akses token-gated |

### 🗝️ Filosofi Keamanan Kunci API

Project ini membagi kredensial Supabase dalam **dua kelas** — jangan pernah
mencampurnya:

| Kelas | Kunci | Terlihat di build? | Bisa di-commit? |
|---|---|---|---|
| **Publishable** (aman publik) | `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_TURNSTILE_SITE_KEY` | Ya (`import.meta.env.PUBLIC_*`) | Ya — memang dirancang untuk frontend/browser |
| **Secret** (rahasia) | `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, `BACKUP_FETCH_TOKEN`, `GDRIVE_CONFIG_ENCRYPTION_SECRET` | **Tidak pernah** | **Tidak pernah** — hanya runtime secret Worker (`wrangler secret put`) |

Alasan `anon` key boleh publik: anon hanya beroperasi **di bawah RLS Postgres**.
Semua tabel produksi punya kebijakan RLS ketat (MFA `aal2` + role `admin`/`editor`
untuk tulis, deny-by-default). Tanpa role & session yang valid, anon key hanyalah
"kunci pintu terbuka" yang tidak bisa membuka apa pun. `service_role` adalah
kebalikannya — melewati RLS sepenuhnya (privilege eskalasi), maka ia **hanya**
hidup di server-side: Worker secret + endpoint `/api/backup-config` yang di-gate
`BACKUP_FETCH_TOKEN` + rate-limit, dan tidak pernah menyentuh bundle.

Konvensi penamaan di kode:
- Prefix `PUBLIC_` (Astro) / `NEXT_PUBLIC_` (Next.js) → ekspos ke browser → **hanya** kunci publishable
- Tanpa prefix → `env.*` di Cloudflare `cloudflare:workers` → runtime secret, wajib via `wrangler secret put`
- Guard `src/lib/supabase.ts`: build gagal-lunak (demo data) bila `PUBLIC_*` belum di-set, sehingga key yang salah tidak pernah jatuh ke produksi dalam diam

Cara memverifikasi kunci secret TIDAK bocor ke bundle: `rg "SUPABASE_SERVICE_ROLE|TURNSTILE_SECRET" dist/` → harus 0 hasil setelah `npm run build`.

---

## 📄 Lisensi

Dilisensikan di bawah [MIT License](LICENSE) — boleh digunakan, dimodifikasi,
dan didistribusikan ulang dengan syarat menyertakan lisensi & atribusi;
tanpa jaminan apa pun (lihat LICENSE untuk detail).

---

<div align="center">

Dibangun dengan ❤️ oleh [Indy Adira Khalfani](https://github.com/indyadirak) — *stay curious, stay secure.*

</div>
