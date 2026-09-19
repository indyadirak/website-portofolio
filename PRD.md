# PRD — Product Requirements Document

**Produk:** Website Portofolio Cyber Security — `portofolio.indyadirak.my.id`
**Pemilik:** Indy Adira Khalfani · **Status:** LIVE (produksi)
**Diperbarui:** Public UX dan Admin Workspace (lihat `CHANGELOG.md`)

## 1. Visi

Portofolio **berbasis bukti, bukan klaim**. Setiap kompetensi harus dapat
diverifikasi oleh pembaca: sertifikat memiliki tautan ke halaman verifikasi
resmi issuer, project ditulis dengan struktur Problem/Approach/Impact, dan
keahlian ofensif ditunjukkan lewat write-up CTF terstruktur (THM/HTB) —
bukan sekadar daftar skill. Desain "SOC terminal" (monospace, log-style)
merupakan identitas visual sekaligus sinyal kompetensi.

## 2. Target Audiens

| Audiens | Kebutuhan | Disediakan oleh |
|---|---|---|
| Recruiter / hiring manager (cyber security) | Buket cepat kompetensi + bukti | Hero, skills, sertifikat terverifikasi, project, CV (id/en) |
| Profesional sejawat / komunitas | Kedalaman teknis | Write-up CTF terstruktur, blog eksternal |
| Kalangan umum / klien potensial | Kesannya kredibel & aman | Halaman publik terawat, security posture (CSP, security.txt) |

## 3. Fitur Inti

### 3.1 Situs Publik
- Landing: positioning hero, featured projects, skills, dan contact CTA.
  Operations Log/System Status bukan bagian dari alur utama landing page agar
  bukti karya dan CTA recruiter muncul lebih cepat.
- **Halaman Sertifikat** (`/certificates`, `/en/certificates`): filter
  Compliance/Training, badge verifikasi issuer, badge masa berlaku
  (dihitung saat build — halaman prerender).
- **Write-ups** (`/writeups`): case study CTF terstruktur
  (target environment, methodology, severity, findings, remediation).
- **Projects** dengan kategori **dinamis** dari database (FK
  `project_categories`, 14 seed) + filter publik.
- **CVE opsional** direncanakan untuk project dan write-up; implementasi harus
  mencakup migrasi, validasi format, dan link NVD sebelum dianggap selesai.
- **Identitas dinamis** (FASE 2/3): hero title, tagline, short bio,
  availability status, career timeline, social links — semua dari
  `site_settings`/`experiences`/`social_links`.
- **CV/Resume** PDF per bahasa (id/en) — download URL selalu menunjuk file
  terbaru.
- **Form kontak anti-bot**: honeypot + Turnstile + rate limit per IP.
- **i18n** Indonesia (default) & English (`/en/*`), sitemap dinamis + hreflang.
- **Demo data** bawaan bila Supabase belum dikonfigurasi (situs tetap utuh).

### 3.2 Admin CMS (`/admin`)
- **Login 3 langkah**: password → kode MFA 6 digit → enroll QR (TOTP)
  pada login pertama; MFA wajib untuk admin/editor.
- **Dashboard command center**: KPI, quick actions, recent activity,
  system status, peringatan sertifikat kedaluwarsa (≤90 hari).
- **Projects**: halaman list (`/admin/projects`) + form
  (`/admin/projects/new`, mode edit via `?id=`), kategori dinamis.
- **Certificates**: list + form terpisah, upload file (PDF/PNG/JPG/WebP/GIF,
  maks 5 MB, validasi magic bytes), kategori, featured, URL verifikasi.
- **Contact messages** (`/admin/messages`): list, tandai dibaca, hapus
  (Fase 2).
- **Write-ups**: CMS CRUD terstruktur.
- **Site settings, experiences, social links, CV, backup config** — CRUD GUI.
- **RBAC** `admin`/`editor`/`viewer`; menu & tombol menyesuaikan role.
- Admin workspace menggunakan sidebar/drawer terkelompok dan profile menu
  account; halaman login tetap memakai layout autentikasi publik.

### 3.3 Keamanan & Infrastruktur
- RLS sebagai penegak izin utama (MFA `aal2` + role di level database).
- Rate limiting + lockout progresif anti brute-force (KV, fail-closed).
- Audit trail: percobaan login & akses kredensial backup (retensi 90 hari).
- **Backup 3-2-1**: pg_dump mingguan (GPG) + offload Google Drive
  (rotasi 12 minggu), kredensial Drive dienkripsi AES-256-GCM at-rest.
- Data retention terjadwal: contact 12 bulan, audit 90 hari.
- Observability: invocation logs, SBOM, CodeQL, dependency review.

## 4. Batasan Scope (OUT OF SCOPE)

- **Bukan situs multi-user** — satu pemilik; tidak ada registrasi publik,
  tidak ada akun reader.
- **Blog tidak di domain ini** — blog eksternal `blog.indyadirak.my.id`
  (Blogger), hanya dilink dari navbar/footer.
- **Tanpa framework client** — interaktivitas dengan vanilla JS di `<script>`
  Astro (sesuai filosofi Astro + CSP ketat).
- **Tanpa pembayaran / e-commerce / forum / komentar publik.**
- Badge masa berlaku sertifikat **bukan real-time** (build-time) —
  diperbarui setiap deploy, ini keputusan desain (halaman statis prerender).
- **Home Lab** — konten showcase lab rumahan (topologi, lab environment)
  direncanakan sebagai **konten Fase 3** (disajikan via struktur
  project/write-up yang ada), bukan fitur backend baru.

## 5. Kriteria Sukses

1. Pembuka situs dapat memverifikasi minimal 3 bukti kompetensi
   (sertifikat + project + write-up) dalam < 5 menit.
2. Mutasi konten tanpa deploy (edit di admin → live langsung, kecuali
   halaman prerender yang mengikuti siklus deploy).
3. Tanpa kerentanan terbuka pada hasil scan (CSP, RLS, upload, brute-force).
4. Situs publik tetap 100% render saat dependensi gagal (anti-500 + demo data).
