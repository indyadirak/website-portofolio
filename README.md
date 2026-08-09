<div align="center">

# 🛡️ Website Portofolio — Cyber Security

Portfolio website untuk profesional **Cyber Security**, dibangun di atas **Astro** + **Tailwind CSS v4** + **Supabase**, dilengkapi **Admin CMS** dengan autentikasi multi-faktor (MFA) dan kontrol akses berbasis peran (RBAC).

[![Astro](https://img.shields.io/badge/Astro-7-FF5D01?logo=astro&logoColor=white)](https://astro.build)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![License](https://img.shields.io/badge/License-TBD-555?style=flat-square)]()

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
- **Landing page portfolio** — hero, featured projects, skills, about, contact
- **Dukungan 2 bahasa (i18n)** — Indonesia (default, tanpa prefix) & English (`/en/*`)
- **Demo data bawaan** — situs tetap tampil utuh sebelum Supabase dikonfigurasi
- **Form kontak anti-bot** — proteksi [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/)

### 🔐 Admin CMS (`/admin`)
- **Login 3 langkah** — password → kode MFA 6 digit → enroll QR (TOTP)
- **Manajemen sertifikat** — CRUD lengkap dengan upload file (PDF/PNG/JPG/WebP/GIF, maks 5 MB)
- **Validasi upload server-side** — verifikasi *magic bytes*; file dengan ekstensi bohong ditolak
- **RBAC** — `admin` / `editor` / `viewer`; akses menu menyesuaikan peran
- **MFA wajib (`aal2`)** untuk role `admin`/`editor` — diberlakukan di RLS database, bukan hanya UI
- **Manajemen CV/Resume** — upload PDF per bahasa (id/en) dari GUI; tombol unduh di situs otomatis menunjuk file terbaru
- **Backup konfigurasi** — kelola kredensial & target backup dari GUI admin

### 🛡️ Keamanan
- **RLS di semua tabel** — izin data dipaksa di level database
- **CSP ketat** tanpa `unsafe-inline` — semua style & script file eksternal
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
│   ├── components/            # Hero, SkillGrid, ProjectGrid, admin/, ...
│   ├── layouts/               # BaseLayout (head, nav, footer)
│   ├── lib/                   # supabase, auth, storage, config, i18n, data
│   ├── middleware.ts          # validasi session + guard /admin
│   ├── pages/
│   │   ├── index.astro, about, projects, contact, 404   # publik (id & en/)
│   │   ├── admin/             # login, dashboard, backup, cv
│   │   └── api/               # auth/*, certificates, contact, backup-config, admin/cv
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
#    (schema → rbac-mfa → storage → sisanya)

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
| **Manual**              | `npx wrangler deploy` setelah `npm run build`                       |

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

---

## 📄 Lisensi

Belum ditentukan — silakan hubungi pemilik repository sebelum menggunakan ulang.

---

<div align="center">

Dibangun dengan ❤️ oleh [Indy Adira Khalfani](https://github.com/indyadirak) — *stay curious, stay secure.*

</div>
