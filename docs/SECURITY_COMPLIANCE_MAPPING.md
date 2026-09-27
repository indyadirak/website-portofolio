# SECURITY COMPLIANCE MAPPING — Website Portofolio (Astro + Supabase + Cloudflare Workers)

> ## ⚠️ DISCLAIMER WAJIB DIBACA
>
> Dokumen ini adalah **self-assessment internal** yang disusun sendiri oleh pemilik
> repository (bukan auditor independen), dengan metodologi pemetaan terhadap
> **NIST Cybersecurity Framework (CSF) 2.0** dan **ISO/IEC 27001:2022 Annex A**.
>
> - Dokumen ini **BUKAN hasil audit pihak ketiga** dan **BUKAN sertifikasi**.
> - Istilah yang dipakai di seluruh dokumen: **"selaras dengan"** (aligned with)
>   atau **"mengadopsi prinsip dari"** (adopts principles from). Istilah
>   **"patuh"/"compliant"/"tersertifikasi"/"certified" TIDAK digunakan** karena
>   status tersebut hanya sah setelah audit resmi oleh certification body
>   (mis. untuk ISO 27001) atau penilaian formal oleh lembaga yang berwenang.
> - **Tidak boleh dipakai sebagai klaim sertifikasi di CV/portofolio** tanpa
>   audit sungguhan oleh pihak ketiga yang berlisensi.
> - Status "selaras" di sini berarti: mekanisme yang ada mengadopsi prinsip dari
>   kontrol yang dimaksud, dengan bukti yang dapat diverifikasi dari repositori.

---

## 1. Scope, Metodologi & Konteks

| Aspek | Keterangan |
|---|---|
| Objek audit | Seluruh repositori `website-portofolio` (commit terverifikasi: `90b7312`, `main`) |
| Ruang lingkup | Code base (`src/`, `public/`, `.github/`), migrasi SQL (`supabase/*.sql`), dokumentasi (`README.md`, `docs/DEPLOYMENT.md`, `SECURITY.md`) |
| Tanggal assessment | 17 Agustus 2026 |
| Kerangka acuan | NIST CSF 2.0 (6 fungsi, 22 kategori) · ISO/IEC 27001:2022 Annex A (93 kontrol) |
| Metode | Pemetaan kontrol terhadap bukti konkret (nama file/baris/fitur), bukan klaim abstrak |

### Konteks organisasi (penting untuk skala penilaian)

Project ini dikelola **satu orang** (pemilik tunggal: developer, admin, dan
penanggung jawab keamanan sekaligus). Konsekuensi yang diakui secara eksplisit
pada dokumen ini:

- Kontrol **proses/organisasi** yang secara natural membutuhkan struktur formal
  — seperti _risk register_ resmi, management review berkala, audit internal
  terjadwal, segregasi tugas, maupun program pelatihan kepegawaian — **secara
  wajar tidak sepenuhnya berlaku** untuk konteks satu orang. Ini **bukan
  kegagalan**, melainkan konteks yang wajar; penilaian difokuskan pada kontrol
  yang relevan dan dapat dijalankan dalam skala ini.
- Infrastruktur ditanggung sepenuhnya oleh **provider cloud pihak ketiga**
  (Cloudflare, Supabase, GitHub) dengan **shared responsibility model** —
  hampir seluruh kontrol fisik (Annex A.7) dan sebagian kontrol jaringan/kapasitas
  dikelola provider, sehingga dinilai sebagai "didelegasikan ke provider"
  (mitigasi residual harus tetap diverifikasi, bukan sekadar diasumsikan).

---

## 2. Inventaris Kontrol yang Diimplementasikan

Legenda tingkat adopsi:
- **KUAT** — mekanisme lengkap, berlapis, dan dapat diverifikasi dari kode
- **SEDANG** — ada, berfungsi, tetapi parsial / belum didokumentasikan sebagai proses
- **TERDELEGASI** — dikelola provider cloud (perlu verifikasi berkala oleh pemilik)

### 2.1 NIST CSF 2.0 — GOVERN (GV)

| CSF Kategori | Kontrol yang diimplementasikan | Status | ISO 27001:2022 | Bukti di repositori |
|---|---|---|---|---|
| GV.OS Context | Konteks bisnis & teknologi terdokumentasi: arsitektur, tech stack, filosofi keamanan "dua kelas kunci" | SEDANG | A.5.23 | `README.md` (Tech Stack, Filosofi Keamanan), `docs/DEPLOYMENT.md` §"Versi infrastruktur", `wrangler.toml` |
| GV.RM Risk strategy | Pengambilan keputusan berbasis risiko terdokumentasi di komentar kode (fail-closed vs fail-open per endpoint) — bukan _risk register_ formal | SEDANG | A.5.1, A.5.2 | `src/lib/rateLimit.ts` (dokumentasi tiap guard), `src/middleware.ts:86-94`, `src/pages/api/backup-config.ts:9-31` |
| GV.RR Roles & responsibilities | RBAC tiga peran (admin/editor/viewer) + pemetaan tanggung jawab pemilik via CODEOWNERS | KUAT | A.5.2, A.5.18 | `supabase/rbac-mfa.sql`, `src/lib/auth.ts:83-106`, `.github/CODEOWNERS` |
| GV.PO Policy | Security policy (pelaporan kerentanan, timeline, praktik) terdokumentasi | KUAT | A.5.1, A.6.8 | `SECURITY.md` |
| GV.OV Oversight | Review wajib pemilik pada path sensitif + PR-only ke `main` + auto-deploy | KUAT | A.5.36, A.8.32 | `.github/CODEOWNERS`, `.github/workflows/deploy.yml` (push ke `main` saja) |
| GV.SC Supply chain | Dependency review gate (fail high/critical), Dependabot bulanan + security updates, pin Node eksplisit, versi action dipin | KUAT | A.5.21, A.8.8, A.8.29 | `.github/workflows/dependency-review.yml`, `.github/dependabot.yml`, `deploy.yml`/`db-backup.yml` (setup-node@v4, action@v4) |

### 2.2 NIST CSF 2.0 — IDENTIFY (ID)

| CSF Kategori | Kontrol yang diimplementasikan | Status | ISO 27001:2022 | Bukti di repositori |
|---|---|---|---|---|
| ID.AM Asset management | Inventaris aset teknis di dokumentasi: routing, binding, secrets, tabel DB, alur deployment | SEDANG | A.5.9, A.5.10 | `docs/DEPLOYMENT.md` (checklist infra penuh), `README.md` (Struktur Project), `wrangler.toml:4-30` (klasifikasi env) |
| ID.RA Risk assessment | Ancaman dipertimbangkan per fitur (tidak formal): brute-force, spoofing upload, CSRF, token leak, placeholder KV inert | SEDANG | A.5.8, A.5.25 | Komentar desain di `src/lib/rateLimit.ts`, `src/lib/storage.ts:46-52`, `src/pages/api/admin/backup-config.ts:15-28`, `deploy.yml:20-31` |
| ID.IM Improvement | Loop perbaikan nyata dari temuan (contoh: perbaikan urutan migrasi 42P01, nanoid CVE, placeholder KV guard) — bukan proses terjadwal | SEDANG | A.5.27 | Riwayat git (mis. batch fix pre-deploy, batas 5MB, magic bytes), `docs/DEPLOYMENT.md:11-19` |
| ID.RV Risk info sharing | Terbatas: advisories vendor (GitHub, Dependabot) melewati otomatisasi | SEDANG | A.5.7 | `.github/dependabot.yml`, SECURITY.md |

### 2.3 NIST CSF 2.0 — PROTECT (PR) — *area terkuat project ini*

| CSF Kategori | Kontrol yang diimplementasikan | Status | ISO 27001:2022 | Bukti di repositori |
|---|---|---|---|---|
| PR.AA Identity & access | Autentikasi PKCE + sesi cookie; **MFA TOTP wajib (aal2) untuk admin/editor yang ditegakkan di DATABASE (RLS), bukan hanya UI**; RBAC dua lapis (app + Postgres); brute-force: rate limit berlapis per-IP & per-IP+email + lockout progresif 15m→4j (fail-closed); role check ulang di tiap API + guard halaman admin-only; anti enumerasi email (pesan generik, email NULL di log blocked) | **KUAT** | A.5.15, A.5.16, A.5.17, A.5.18, A.8.2, A.8.5 | `supabase/rbac-mfa.sql:60-149` (policy `(select auth.jwt()->>'aal')='aal2'`), `supabase/storage.sql:40-71`, `src/lib/auth.ts` (pkce, resolveMfaStatus, hasRole), `src/middleware.ts:121-140` (guard /admin + /admin/backup,/admin/cv admin-only), `src/lib/rateLimit.ts:8-22` (LOGIN_LIMITS), `src/pages/api/auth/login.ts:55-93`, `src/pages/api/auth/mfa-enroll.ts` (enrollment wajib first-login) |
| PR.AT Awareness | Dokumentasi keamanan & praktik dipelihara pemilik (bukan program pelatihan formal) | SEDANG | A.6.3, A.6.8 | `SECURITY.md`, `README.md` (Filosofi Keamanan), komentar arsitektur menyeluruh |
| PR.DS Data security | RLS deny-by-default di SEMUA tabel; Storage bucket privat `certificates` (bucket `cv` publik sengaja, PDF-only); validasi upload server-side (allowlist MIME + **magic bytes** + 5 MB + path UUID acak ≠ nama user, anti path traversal); kredensial Drive **terenkripsi AES-256-GCM at-rest** di DB; DLP ringan: CSP tanpa unsafe-inline, secret tak pernah masuk bundle (verifikasi via `rg` tercantum di README); minimasi data (email NULL, slice UA 0-500, key tak pernah di-echo) | **KUAT** | A.8.3, A.8.11, A.8.12, A.8.24, A.5.12, A.5.13 | `supabase/*.sql` (semua policy), `src/lib/storage.ts:10-99` (magic bytes 0x25 0x50 0x44 0x46 dll), `src/pages/api/admin/backup-config.ts:49-55` (encryptKey), `README.md:182-205` (klasifikasi dua kelas kunci), `src/pages/api/certificates.ts` (sanitasi 150 char) |
| PR.PS Platform security | Security headers + **CSP ketat tanpa unsafe-inline untuk script/source** (style-src dilonggarkan hanya di dev); X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP same-origin, **HSTS 2 tahun + preload**, upgrade-insecure-requests, frame-ancestors none; build dipaksa kompatibel CSP (`inlineStylesheets: 'never'`, `assetsInlineLimit: 0`); Turnstile anti-bot; rate limit kontak (3/10m) + honeypot + validasi panjang; KV id placeholder diblokir saat deploy (anti fail-open senyap) | **KUAT** | A.8.9, A.8.20, A.5.37 | `src/middleware.ts:37-47`, `public/_headers` (salinan identik, fallback statis), `astro.config.mjs:27-40`, `src/pages/api/contact.ts` (Turnstile fail-closed, honeypot:77-80, limiter), `deploy.yml:26-31` (Guard KV), `wrangler.toml:41-43` |
| PR.IR Resilience | Redundansi platform (Workers edge + Supabase managed, KV terdistribusi); backup 3-2-1 mingguan (artifacts + Google Drive); keputusan redundancy dicatat (dump publik-schema saja, pooler session) | SEDANG | A.8.14, A.5.24, A.8.13 | `.github/workflows/db-backup.yml` (tiap minggu 02:00 UTC, pg_dump publik schema, GPG AES-256, upload Drive continue-on-error, retensi), `docs/DEPLOYMENT.md:21-27` |

### 2.4 NIST CSF 2.0 — DETECT (DE)

| CSF Kategori | Kontrol yang diimplementasikan | Status | ISO 27001:2022 | Bukti di repositori |
|---|---|---|---|---|
| DE.CM Continuous monitoring | CodeQL manual-only (repo private tanpa GHAS — upload SARIF otomatis ditolak GitHub); Dependency Review gate di PR; Dependabot (monthly + security updates otomatis); npm audit (saat ini 0 vuln); **audit trail login** (success/failed/blocked + blocker) dan **audit akses kredensial backup** (success/failed/blocked + alasan) dengan retensi 90 hari | **KUAT** | A.8.8, A.8.15, A.8.16, A.5.28 | `.github/workflows/codeql.yml` (workflow_dispatch saja + alasan), `dependency-review.yml` (fail-on-severity high), `.github/dependabot.yml`, `supabase/login-attempts.sql` (RPC SECURITY DEFINER), `supabase/backup-config-access-log.sql`, `src/lib/audit.ts`, `src/pages/api/backup-config.ts:70-107` (log + cleanup 90 hari) |
| DE.AE Adverse event analysis | Tidak ada SIEM/analisis runtime terotomatisasi; jejak forensik mentah tersedia di tabel audit + GitHub alerts. Analisis manual saat insiden | SEDANG | A.5.25, A.8.16 | Tabel `login_attempts`/`backup_config_access_log` (cukup untuk rekonstruksi manual) |

### 2.5 NIST CSF 2.0 — RESPOND (RS)

| CSF Kategori | Kontrol yang diimplementasikan | Status | ISO 27001:2022 | Bukti di repositori |
|---|---|---|---|---|
| RS.MA Incident management | Jalur pelaporan resmi (Private Vulnerability Reporting) + timeline respons tertulis; single-point respons oleh pemilik | SEDANG | A.5.26, A.6.8 | `SECURITY.md:11-32` (jalur resmi, timeline 48j/72j, poin reproduksi) |
| RS.CO / RS.AN / RS.MI | Tidak ada runbook insiden tertulis atau klasifikasi dampak; mitigasi praktis (rollback deploy, rotasi secret) bisa dijalankan cepat karena infra as-code | SEDANG | A.5.25, A.5.26 | Infra as-code memungkinkan rollback git; rotasi secret via `wrangler secret put` didokumentasikan di `deploy.yml:66-120` |
| RS.IM Improvements | Perbaikan pasca-insiden terjadi (lihat riwayat CVE nanoid, Dependabot alert) — tanpa proses pelajaran terdokumentasi formal | SEDANG | A.5.27 | Git history `2926dfc`, `90b7312` |

### 2.6 NIST CSF 2.0 — RECOVER (RC)

| CSF Kategori | Kontrol yang diimplementasikan | Status | ISO 27001:2022 | Bukti di repositori |
|---|---|---|---|---|
| RC.RP Recovery plan | **Backup 3-2-1 berjalan otomatis**: (1) salinan primer artisan GitHub 30 hari, (2) salinan kedua Google Drive 12 minggu, keduanya **terenkripsi GPG AES-256**; kunci terpisah; pg_dump skema publik (skema `auth` milik Supabase — didokumentasikan); prosedur restore ada di checklist DEPLOYMENT | KUAT (backup) / SEDANG (restore: tanpa uji otomatis end-to-end) | A.8.13, A.8.10, A.5.24 | `.github/workflows/db-backup.yml` (dump→gpg→artifact+Drive→retensi), `.github/scripts/gdrive-backup.mjs` (scope drive.file, retensi 12 minggu), `docs/DEPLOYMENT.md:182` (Restore test checklist) |
| RC.IM Recovery improvement | Tidak ada drill restore terjadwal; retensi dilempar ke konfigurasi (12 minggu Drive, 30 hari artifact) | SEDANG | A.5.29, A.5.27 | Konfigurasi retensi di `db-backup.yml:88,102` & `gdrive-backup.mjs:82` |

### 2.7 Ringkasan pemetaan Annex A (ISO 27001:2022) tambahan yang belum disebut di atas

| Annex A | Judul kontrol | Status adopsi | Bukti |
|---|---|---|---|
| A.5.37 | Documented operating procedures | KUAT | `docs/DEPLOYMENT.md` (checklist end-to-end) |
| A.8.4 | Access to source code | KUAT (parsial) | Repo + CODEOWNERS; akses pengelolaan akun GitHub oleh 1 orang |
| A.8.10 | Information deletion | KUAT | Retensi: artifact 30 hari (`db-backup.yml:103`), Drive 12 minggu (`gdrive-backup.mjs:104-121`), audit log 90 hari (`backup-config.ts:96-101`) |
| A.8.31 | Separation of dev/test/prod | KUAT | `.dev.vars` vs `wrangler secret put`; demo-data fallback dev; fail-closed di prod tanpa KV (`rateLimit.ts:215-224`) |
| A.8.24 | Use of cryptography | KUAT | AES-256-GCM (Drive key), GPG AES-256 (backup), TLS/HSTS+preload, upgrade-insecure-requests, PKCE |
| A.8.28 / A.8.27 | Secure coding / architecture | KUAT | TS strict + `astro check`; `timingSafeEqual` (`backup-config.ts:35-41`), magic bytes, honeypot, fail-closed/fail-open matrix, rollback file yatim (`storage.ts:105-116`) |
| A.8.34 | Protection during audit testing | TERDELEGASI | Tidak ada audit pen-test pihak ketiga (belum pernah dilakukan) |
| A.7.1–A.7.14 | Kontrol fisik | TERDELEGASI | Cloudflare/Supabase (perlu verifikasi sertifikasi vendor — SSAE18/SOC2, tidak diverifikasi manual hingga saat ini) |
| A.8.6 / A.8.17 | Capacity mgmt / clock sync | TERDELEGASI | Provider (KV TTL, edge); rate limit sebagai kontrol kapasitas aplikasi |
| A.8.7 | Protection against malware | SEDANG | CodeQL & dependency review untuk kode sumber; tanpa AV runtime (statis deployment) |

---

## 3. GAP ANALYSIS (jujur)

### 3.1 Gap yang FEASIBLE diperbaiki (skala project ini)

| # | Gap | Kerangka | Mengapa penting | Bukti belum ada |
|---|---|---|---|---|
| G1 | **Kebijakan privasi pengunjung** | ISO A.5.34, A.5.31 · NIST GV.PO, PR.DS | PII contact message harus dijelaskan dan memiliki retensi | Ditangani: `/privacy`, link footer, retention workflow 12 bulan |
| G2 | **RTO/RPO tidak terdokumentasi & restore BELUM pernah diuji end-to-end** — backup jalan 3-2-1, tetapi tidak ada target pemulihan tertulis dan tidak ada bukti `pg_restore` sukses ke project lain; checklist hanya "restore test" manual di DEPLOYMENT | ISO A.5.24, A.5.30, A.8.13 · NIST RC.RP | Backup tanpa restore teruji = ilusi pemulihan | `docs/DEPLOYMENT.md:182` (checklist saja), tidak ada workflow/dokumen hasil drill |
| G3 | **Rate limit lapisan aplikasi untuk endpoint MFA** | ISO A.8.5 · NIST PR.AA | Kode TOTP 6 digit mudah ditebak ulang bila throttle vendor tidak memadai | Ditangani: `mfaVerifyGuard` dipakai oleh `mfa-verify.ts` dan `mfa-enroll-verify.ts` |
| G4 | **Verifikasi CI dan secret scanning** | ISO A.8.9, A.8.29 · NIST DE.CM | Regresi header/CSP dan secret leak perlu dideteksi otomatis | Sebagian ditangani: `deploy.yml` menjalankan audit, type-check, build, dan verifikasi header; push protection tetap bergantung konfigurasi GitHub |
| G5 | **Dokumentasi sinkronisasi tertinggal** — `README.md:124` masih menulis urutan migrasi lama `(schema → rbac-mfa → storage)`, bertentangan dengan `DEPLOYMENT.md` yang sudah dikoreksi (`rbac-mfa` pertama) | ISO A.5.37 · NIST GV.OS | Fresh installer mengikuti README bisa gagal 42P01 | `README.md:121-124` vs `docs/DEPLOYMENT.md:45-46` |
| G6 | **Branch protection belum terverifikasi** — CODEOWNERS menyebut "wajib dipasang branch protection rule" tapi tidak ada bukti (screenshot/pengaturan) bahwa rule aktif di repo | ISO A.8.32 · NIST GV.OV | Review mandatory bisa tak benar-benar berlaku | `.github/CODEOWNERS:3` (komentar "wajib dipasang") |
| G7 | **Lisensi & ketentuan hukum tertunda** ("License: TBD") + SBOM belum diekspor | ISO A.5.31, A.5.21 · NIST GV.SC | Kepatuhan lisensi dependency & reuse rights tidak jelas | `README.md:12` (badge TBD), `README.md:209-211` |
| G8 | **Retensi konten admin-audit** | ISO A.5.33, A.8.10 · NIST PR.DS | Pertumbuhan data dan hygiene PII | ✅ Ditangani: `data-retention.yml` menjalankan purge contact 12 bulan dan audit 90 hari |

### 3.2 Gap yang secara WAJAR di LUAR SCOPE (project satu orang)

| Gap | Kerangka | Catatan |
|---|---|---|
| Risk register formal + management review berkala | A.5.2, GV.RM | Butuh struktur organisasi; penggantinya: keputusan risiko terdokumentasi di kode |
| Audit internal terjadwal / pen-test pihak ketiga berkala | A.5.35, A.8.34 | Biaya & kebutuhan organisasi; relevan hanya jika disertifikasi |
| Segregasi of duties (pemisah developer/operator/auditor) | A.5.3 | Mustahil secara natural untuk 1 orang |
| Program awareness & pelatihan terstruktur (wajib terjadwal) | A.6.3 | Diganti self-education; tidak ada SDM lain |
| 24/7 SOC, SIEM, monitoring runtime terpusat | A.8.16, DE.CM | Tidak proporsional untuk portfolio statis+edge |
| Kontrol fisik A.7.1–A.7.14 seluruhnya | A.7.x | Milik provider (Cloudflare/Supabase DC), shared responsibility |
| Kontrak supplier formal + audit vendor (di luar kebijakan cloud standar) | A.5.19–A.5.22 | Provider enterprise (Supabase SOC2, Cloudflare) — verifikasi sertifikasi vendor cukup |
| BCP/DRP korporat lengkap + tabletop exercise | A.5.29, RC | Pengganti: backup 3-2-1 + dokumentasi restore + drill (G2) |
| Forensik digital formal & collection of evidence terstandar | A.5.28 | Diperlukan hanya jika ada kewajiban hukum |
| Kepatuhan UU PDP/GDPR penuh (kecuali kebijakan privasi G1) | A.5.34 | Tanpa basis pelanggan/processing scale, cukup minimasi data + privasi dasar |

---

## 4. Rekomendasi Prioritas (feasible, urutan nilai/upaya)

| Prioritas | Rekomendasi | Menutup gap | Upaya | Nilai |
|---|---|---|---|---|
| 1 | **Pertahankan urutan migrasi terdokumentasi** — `rbac-mfa` pertama, lalu migrasi fitur | G5 | selesai | Mencegah kegagalan deploy orang lain/masa depan |
| 2 | **Pertahankan halaman `/privacy` (id/en)** + link footer dan retensi terdokumentasi | G1 | selesai | Kepatuhan dasar dan kepercayaan pengunjung |
| 3 | **Dokumentasikan RTO/RPO + jalankan restore drill end-to-end**: restore `backup.sql.gpg` ke Supabase project sementara via `psql`/`pg_restore`, catat hasil di `DEPLOYMENT.md` (mis. RPO ≤ 7 hari, RTO ≤ 1 hari) | G2 | ~2–4 jam sekali jalan + dokumen | Backup yang teruji nilainya jauh di atas backup yang tidak |
| 4 | **Rate limit aplikasi untuk endpoint MFA** (`mfaVerifyGuard`) | G3 | selesai | Menutup celah brute-force TOTP |
| 5 | **Step CI verifikasi keamanan**: type-check, audit, build, dan assert header pasca-deploy | G4 | selesai | Mendeteksi regresi sebelum publik melihat |
| 6 | **Aktifkan & verifikasi secret scanning push protection** GitHub + **export SBOM** (Actions bawaan `dependency-submission`) | G4, G7 | ~30 menit | Pencegahan secret leak + ketelusuran dependency |
| 7 | **Putuskan lisensi** (MIT/Apache-2.0 atau teks hak cipta tegas) | G7 | ~15 menit | Kejelasan hukum reuse |
| 8 | **Verifikasi branch protection aktif** (PR wajib review 1 orang, code owners) & dokumentasikan di DEPLOYMENT | G6 | ~30 menit | Menutup sisa governance |
| 9 | **Pertahankan kebijakan retensi tertulis**: purge `contact_messages` dan tabel audit melalui workflow terjadwal | G8 | selesai | Hygiene PII & volume |

---

## 4.1 Status Implementasi Rekomendasi

Rekomendasi di atas yang telah dieksekusi (commit/sesi berikutnya, lihat git log):

| Rekomendasi | Status |
|---|---|
| 1. Fix README urutan migrasi (G5) | ✅ Selesai — `README.md` kini menunjuk `rbac-mfa` pertama + opsi file gabungan |
| 2. Halaman `/privacy` + `/en/privacy` (G1) | ✅ Selesai — `src/pages/privacy.astro`, i18n, link footer, sitemap |
| 3. Dokumentasi RTO/RPO (G2) | ✅ Dokumen siap di `docs/DEPLOYMENT.md` §8 — **drill restore masih menunggu dieksekusi** (checklist `drill terakhir: —`) |
| 4. Rate limit aplikasi endpoint MFA (G3) | ✅ Selesai — `mfaVerifyGuard` di `src/lib/rateLimit.ts`, dipakai `mfa-verify.ts` & `mfa-enroll-verify.ts` (10 gagal/IP/10 menit, fail-closed) |
| 5. CI gate keamanan (G4) | ✅ Selesai — `deploy.yml`: step `npm audit --audit-level=high` + verifikasi security headers pasca-deploy pada **dua jalur**: `/` (SSR/middleware) dan `/certificates` (statis/`_headers`) — lihat §4.2 |
| 6. SBOM & secret scanning (G4, G7) | ⏳ SBOM: workflow `sbom.yml` ditambahkan. Secret scanning push protection: tergantung pengaturan GitHub (lihat catatan §3.1 G4) |
| 7. Lisensi (G7) | ✅ Selesai — LICENSE MIT + README diperbarui |
| 8. Branch protection (G6) | ⏳ Tergantung pengaturan GitHub — verifikasi read-only, bukan bagian repo |
| 9. Kebijakan retensi tertulis + purge (G8) | ✅ Selesai — workflow `data-retention.yml` (contact_messages 12 bulan, audit 90 hari) + dokumen §8 DEPLOYMENT.md |
| 10. Pemulihan MFA tanpa ponsel (temuan stress-test) | ✅ Runbook pemulihan di `docs/DEPLOYMENT.md` §8.1 (GUI + SQL, bagaimana jalur Dashboard tidak terpengaruh rate limiter) — **recovery codes tetap gap terbuka** (tidak diimplementasikan; mitigasi: simpan QR cadangan di password manager) |

Catatan: evaluasi ulang disarankan setelah **drill restore pertama** dilakukan (§8 DEPLOYMENT.md).

---

## 4.2 Verifikasi Empiris — Security Headers pada Halaman Statis (Prerender)

Konteks: klaim lama "middleware men-set header pada SETIAP response" baru benar
untuk halaman SSR. Halaman `prerender = true` (termasuk `/certificates`) dilayani
sebagai **static asset** — middleware Worker TIDAK dijalankan, header bergantung
pada `_headers`. Diverifikasi tanggal 17 Agustus 2026 dengan simulasi model
pengiriman produksi yang sama (workerd + ASSETS binding + `_headers` dari build):

```
$ wrangler dev -c <config assets=dist/client>   # wrangler 4.120.0
[wrangler:info] Parsed 2 valid header rules.     # _headers dibaca oleh runtime

$ curl -sSI http://127.0.0.1:8801/certificates/
HTTP/1.1 307 Temporary Redirect     # normalisasi direktori; header TETAP ada
content-security-policy: default-src 'self'; ... object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-content-type-options: nosniff
x-frame-options: DENY

$ curl -sSI http://127.0.0.1:8801/certificates/   # final 200
HTTP/1.1 200 OK
content-security-policy: ... ; upgrade-insecure-requests   # SAMA lengkap
strict-transport-security: ...; preload
x-content-type-options: nosniff
x-frame-options: DENY

$ curl -sSI http://127.0.0.1:8801/_astro/<hash>.css
Cache-Control: public, max-age=31536000, immutable    # rule adapter juga jalan
```

Kesimpulan:
1. **CSP/HSTS/nosniff/XFO TERBUKTI muncul di halaman `/certificates` (statis)**
   — via `_headers` (`public/_headers` → `dist/client/_headers`, rule `/*`),
   bukan middleware. Kekhawatiran "middleware ter-skip → halaman tanpa header"
   **tidak terjadi**; sebaliknya, `_headers` adalah mekanisme utama untuk
   halaman prerender (konsisten dengan komentar desain di `middleware.ts`).
2. Bukti kode yang mendukung: `src/pages/certificates.astro:4`
   (`prerender = true`), `astro.config.mjs:11` (`output: 'server'`),
   `dist/client/_headers` (2 rules; adapter meng-inject `/_astro/*`).
3. Batasan jujur: pengujian dilakukan pada runtime local workerd (model
   pengiriman identik dengan produksi Workers Static Assets), bukan curl ke
   domain live — domain `portofolio.indyadirak.my.id` tidak resolve dari mesin
   audit (DNS kustom belum/tdk terhubung dari jaringan ini). Verifikasi live
   final ada di CI: step **"Verify security headers (production)"** di
   `deploy.yml` kini memeriksa DUA jalur: `/` (SSR) dan `/certificates`
   (statis) — regresi di salah satu jalur akan menggagalkan deploy.
4. Klaim "badge valid/expired ikut zaman setelah deploy ulang" DIVERIFIKASI ke
   kode: `CertificatesPage.astro:13` memanggil `getCertificates()` saat
   prerender → status vs tanggal sekarang dihitung pada build → benar bahwa
   badge baru ter-update setelah deploy berikutnya.

---

## 5. Penilaian Akhir Auditor

- **Dari 22 kategori CSF 2.0**: ±9 kategori secara **KUAT** (PR.AA, PR.DS, PR.PS, DE.CM, GV.PO, GV.RR, GV.SC, GV.OV, ID.AM) dan ±10 **SEDANG** (seluruh Govern/Identify/Respond/Recover lainnya); sisanya melekat pada kontrol formal yang wajar di luar scope satu orang.
- **Annex A ISO 27001:2022**: ±25 kontrol relevan teradopsi dengan bukti konkret **KUAT** (kluster A.8.2–A.8.13 teknis sangat kuat), ±8 **SEDANG**; kontrol organisasi/people/fisik secara wajar sebagian besar di luar scope konteks satu orang — konsisten dengan disclaimer di atas.
- **Kekuatan utama**: kontrol akses & autentikasi berlapis dengan **MFA ditegakkan di level database** (jarang di project solo), rantai persediaan (CI/CD) keamanan hampir lengkap, enkripsi at-rest dan in-transit, serta backup 3-2-1 terotomasi.
- **Kelemahan utama**: ketiadaan kebijakan privasi (PII nyata dikumpulkan), restore backup belum pernah diuji, dan beberapa keputusan governance tak terdokumentasi eksternal (branch protection, retensi).
