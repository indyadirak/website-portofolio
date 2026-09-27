# 🛡️ Cybersecurity Portfolio

Portofolio cybersecurity **berbasis bukti nyata** untuk menampilkan kompetensi
melalui project, security case study, sertifikasi terverifikasi, career
timeline, dan home lab. Situs ini dibangun sebagai aplikasi web production-grade
dengan Admin CMS, MFA, RBAC, PostgreSQL RLS, dan deployment edge.

Produksi: **[portofolio.indyadirak.my.id](https://portofolio.indyadirak.my.id)**

## ✨ Fitur Utama

### Situs Publik

- Landing page berorientasi recruiter dengan positioning, project unggulan,
  skills, dan CTA kontak/CV yang ringkas.
- **Evidence-based Projects** dengan struktur Problem, Approach, dan Impact.
- **Security Write-ups** untuk case study THM, HTB, CTF, dan riset keamanan.
- Sistem **Draft dan Published** untuk menyiapkan write-up sebelum dipublikasikan.
- Dukungan blok kode terminal dan ASCII Art untuk topologi Home Lab.
- Sertifikat dengan kategori Competency/Training, URL verifikasi issuer, dan
  status masa berlaku.
- About dinamis: bio, specializations, contact info, social links, dan career
  timeline dikelola dari Admin CMS.
- Social links dinamis dengan dukungan icon class atau URL gambar custom.
- Contact form dengan Cloudflare Turnstile, honeypot, validasi input, dan rate
  limiting.
- Indonesia sebagai locale default dan English melalui `/en/*`.
- Demo data fallback ketika Supabase belum dikonfigurasi.
- Responsive UI untuk smartphone: mobile navigation, card fallback untuk tabel,
  responsive forms/grids, modal viewport-safe, dan admin drawer.
- Admin login memakai authentication-only layout agar alur password, MFA, dan
  enrollment tidak tercampur dengan navigasi public site.
- Rebuild otomatis: mutasi konten CMS (project, sertifikat, write-up, dsb.)
  memicu workflow Deploy via GitHub API (cooldown 10 menit); tombol Publish
  manual tersedia di dashboard untuk admin.

### Admin CMS

- Login password + MFA TOTP dengan level assurance `aal2`.
- RBAC tiga role: `admin`, `editor`, dan `viewer`.
- CRUD Projects, dynamic project categories, Certificates, Write-ups, Contact
  Messages, Site Settings, Experiences, Social Links, CV, dan backup config.
- Halaman terpisah untuk list dan form Projects/Certificates.
- Contact Messages: tandai dibaca dan hard delete dengan audit-friendly RLS.
- Admin workspace dengan sidebar desktop/drawer mobile, pengelompokan menu, dan
  profile menu account yang menampilkan role, status MFA, shortcut website, serta logout.
- Upload sertifikat melalui validasi MIME dan magic bytes.
- Keep-alive Supabase melalui endpoint SSR `/api/health` dan GitHub Actions.

## 🧰 Tech Stack

| Area | Teknologi |
|---|---|
| Framework | Astro 7 — SSR dan prerender |
| Runtime | Cloudflare Workers dengan Cloudflare KV |
| Styling | Tailwind CSS v4 dan global CSS |
| Language | TypeScript strict |
| Backend | Supabase Auth, PostgreSQL, RLS, dan Storage |
| Authentication | PKCE, cookie session, TOTP MFA |
| Deployment | GitHub Actions → Cloudflare Workers |
| Localization | Bahasa Indonesia dan English |
| Node.js | ≥ 22.12 |

## 🏗️ Arsitektur Keamanan

Project menggunakan pendekatan **defense-in-depth**:

| Lapisan | Kontrol |
|---|---|
| Edge | Cloudflare Workers, HSTS, TLS minimum 1.2 di Cloudflare Zone |
| Headers | CSP ketat, COEP `credentialless`, COOP, CORP, X-Frame-Options, Permissions-Policy |
| CSP | Production tanpa `unsafe-eval` dan tanpa `unsafe-inline`; exception style dev hanya untuk Vite HMR |
| Authentication | PKCE, cookie session, TOTP MFA, `aal2` untuk admin/editor |
| Authorization | API role checks + PostgreSQL RLS sebagai enforcement utama |
| RLS role check | Selalu subquery `public.profiles`; tidak memakai `auth.jwt() ->> 'role'` |
| Rate limiting | Per-IP, per-IP/email, lockout progresif, dan admin mutation guard |
| Anti-bot | Cloudflare Turnstile + honeypot pada form kontak |
| Upload | MIME allowlist, magic bytes, ukuran maksimum, dan object path validation |
| Storage | Supabase object storage dengan regex/shape validation; bukan filesystem path resolution |
| Audit | `login_attempts` dan `backup_config_access_log` dengan retensi 90 hari |
| Supply chain | Dependency review, SBOM, Dependabot, npm audit gate, dan action pinning (CodeQL manual-only: repo private tanpa GHAS) |

Policy mutation kanonik menggunakan `aal2` dan role dari `public.profiles`:

```sql
(select auth.jwt() ->> 'aal') = 'aal2'
and exists (
  select 1 from public.profiles
  where profiles.id = auth.uid()
    and profiles.role in ('admin', 'editor')
)
```

`service_role` dan secret runtime tidak pernah dimasukkan ke bundle publik.
Kredensial Worker dikelola melalui Cloudflare secrets dan GitHub Secrets.

## 🧱 Struktur Proyek

```text
.
├── src/
│   ├── components/       # Komponen publik dan admin
│   ├── layouts/          # MainLayout dan AdminLayout
│   ├── lib/              # Auth, data layer, types, i18n, rate limit, storage
│   ├── pages/             # Route publik, admin, dan API
│   ├── styles/            # Global CSS dan design tokens
│   └── middleware.ts      # Security headers, session, dan route guards
├── supabase/              # Schema, migration, RLS, storage, audit
├── public/                # Static assets dan security headers fallback
├── docs/                  # Deployment, compliance, dan review checklist
├── .github/workflows/     # Deploy, backup, retention, security scan, keep-alive
├── ARCHITECTURE.md        # Desain teknis dan keamanan
├── PROJECT_CONTEXT.md     # Aturan kerja dan memori proyek
├── PRD.md                 # Product requirements
├── TASKS.md               # Roadmap dan progres
└── CHANGELOG.md           # Riwayat perubahan penting
```

## 🚀 Local Development

### Prasyarat

- Node.js ≥ 22.12
- Project Supabase untuk mengaktifkan Admin CMS

### Menjalankan lokal

```bash
npm install
cp .env.example .env
npm run dev
```

Buka `http://localhost:4321`.

Tanpa environment Supabase, halaman publik menggunakan demo data. Admin
membutuhkan konfigurasi Supabase, profile user, role, dan MFA yang valid.

### Verifikasi

```bash
npm run check
npm run build
```

## 🗄️ Database Setup

Untuk instalasi baru, jalankan `supabase/00-full-migration.sql` melalui
Supabase SQL Editor. Untuk database existing, gunakan migration spesifik di
`supabase/` sesuai fitur, termasuk:

- `99-existing-database-sync.sql` untuk one-shot sync database existing:
  case study project, status read contact messages, RLS, grants, dan schema cache.
- `writeups-status.sql` untuk Draft/Published write-up.
- `contact-messages-crud.sql` untuk status read dan penghapusan pesan.
- `projects-case-study.sql` untuk kolom `methodology`, `attack_path`, dan
  `detection` pada project.
- `site-settings-policy-fix.sql` untuk remediasi policy Site Settings.

`rbac-mfa.sql` harus dijalankan lebih dahulu karena policy tabel lain
bergantung pada `public.profiles`.

Database existing wajib memiliki kolom `projects.methodology`,
`projects.attack_path`, `projects.detection`, dan `contact_messages.is_read`.
Schema dump dari database lama dapat belum mencantumkan kolom tersebut; jalankan
migrasi fitur terkait sebelum memakai form case study atau tombol pesan admin.

## ☁️ Deployment

Deployment production berjalan melalui GitHub Actions saat push ke `main`:

- `deploy.yml`: build dan deploy Cloudflare Workers.
- `supabase-keep-alive.yml`: ping `/api/health` setiap lima hari.
- `db-backup.yml`: backup database terenkripsi.
- `data-retention.yml`: purge data PII dan audit sesuai retensi.
- `codeql.yml`, `sbom.yml`, dan `dependency-review.yml`: supply-chain security.

Secret runtime tidak disimpan di repository. Ikuti checklist lengkap di
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## 📚 Dokumentasi Teknis

- [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) — aturan engineering dan memori proyek.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — desain teknis, RLS, RBAC, dan alur data.
- [`PRD.md`](PRD.md) — visi produk, audiens, fitur, dan scope.
- [`TASKS.md`](TASKS.md) — roadmap dan status pekerjaan.
- [`CHANGELOG.md`](CHANGELOG.md) — perubahan penting per fase.
- [`SECURITY.md`](SECURITY.md) — kebijakan pelaporan vulnerability.

## 📄 Lisensi

MIT License. Lihat [`LICENSE`](LICENSE) untuk detail.

<div align="center">

Built with curiosity, evidence, and a security-first mindset.

</div>
