# PENDING REVIEW CHECKLIST

Dokumen ini adalah konsolidasi permanen seluruh item review keamanan/infrastruktur yang
masuk ke project ini. Tujuan: tidak bergantung pada memori sesi chat — semua item, status,
dan estimasi prioritas tercatat di sini dan diperbarui setiap sesi.

- Status: `[x]` selesai, `[ ]` pending, `[-]` closed (diverifikasi, tidak butuh tindakan).
- Estimasi: **BLOCKER** = harus selesai SEBELUM deploy 15 langkah dimulai;
  **PASCA-LIVE** = aman ditunda setelah live sebagai peningkatan lanjutan.
- Catatan terakhir: 2026-09-19.

---

## 0. Audit 5-area (review sebelumnya — SEKARANG DONE, commit `e863d19`)

| # | Item | Status | Estimasi |
|---|------|--------|----------|
| 0.a | Kebocoran `error.message` DB/Supabase di respons API (10 titik: projects, certificates, upload, admin/cv, logout) — diganti pesan generik, detail tetap di `console.error` | [x] | selesai |
| 0.b | Source maps di production — diverifikasi: tidak ada opsi sourcemap & 0 file `.map` di `dist` | [-] | selesai |
| 0.c | Sisa kode test/debug — easter egg console MainLayout sudah dihapus; log production publik dibersihkan, `console.error/warn` operasional tetap dipertahankan | [x] | selesai |
| 0.d | Rate limit mutasi admin (`adminMutationGuard`, 30 mutasi/menit/user, key `ratelimit:adminmut:`) + wiring di 10 handler | [x] | selesai |
| 0.e | Hardening JSON-LD `set:html` (escape `<` → `\u003c`) di CertificatesPage + MainLayout | [x] | selesai |
| 0.f | **PENINGKATAN BARU:** `adminMutationGuard` diubah FAIL-OPEN → **FAIL-CLOSED** (KV tidak terjangkau ⇒ 503 `service_unavailable`, konsisten dengan `loginAttemptGuard`) — komit sesi ini | [x] | selesai |

---

## 1.x — Infrastruktur & cleanup (PRIORITAS 1: wajib)

### 1.a — Rahasia/infra detail di repositori: KV Namespace ID di `wrangler.toml` — **BLOCKER**
- [ ] Hapus KV Namespace ID (`SESSION_ID` dan `RATE_LIMIT_KV_ID`, tercatat keduanya
      `b6712a968e694199a6dd5efce80d97f8`) dari `wrangler.toml` — keduanya sudah dipakai production.
- [ ] `wrangler.toml` cukup berisi binding name + placeholder jelas; nilai di-inject saat
      deploy via Cloudflare dashboard / `wrangler secret put` / GitHub Actions secrets.
- [ ] Kalau workflow CI butuh nilai ID saat deploy: simpan di GitHub Actions
      secrets/variables (BUKAN di file), bind via `--kv-namespace` di langkah deploy.
- [ ] Periksa juga `compatibility_date` & worker name yang ikut tercatat.
- [ ] Pastikan `.env*` / `.env.example` masuk `.gitignore` (kalau ada dummy key).
- Estimasi: **BLOCKER** — infra detail bocor di repo publik & konfigurasi ini dipakai
  workflow deploy; dibereskan bersamaan penyusunan langkah deploy.

### 1.b — Celah "upload lalu hapus": orphan storage di bucket `certificates` — **PASCA-LIVE**
- [ ] Job cleanup terjadwal (GitHub Action) menjalankan skrip Node:
      1. List semua file bucket `certificates` (Admin API `list`),
      2. List semua `file_url` aktif di tabel `certificates`,
      3. File di bucket tapi tidak ada di tabel = orphan → hapus,
      4. Log yang dihapus (mirror pola `data-retention.yml`, retensi log 90 hari).
- [ ] Pertimbangkan struktur path bucket ber-umur (`YYYY/MM/`) agar reconciliation
      parsial bisa dilakukan — evaluasi saat bucket sudah terisi.
- Estimasi: **PASCA-LIVE** — saat deploy pertama bucket masih kosong; risiko menumpuk
  orphan baru berarti setelah data nyata masuk.

### 1.c — Verifikasi infinite redirect (loop) halaman admin — verifikasi empiris
- [ ] Uji empiris: `curl -svL --max-redirs 10 http://localhost:4321//admin` (double slash)
      — harapkan 2 lompatan (307 → 307 → 200), TANPA loop.
- [ ] Cek header `Location` tiap redirect: `curl -svL --max-redirs 0`.
- Hasil review: tidak ada loop yang teramati dari kondisi uji; sisanya hanya konfirmasi.
- Estimasi: verifikasi 5 menit, bukan blocker; jalankan di sesi uji pra-deploy.

### 1.d — Rate limit & IP source (X-Forwarded-For) — diverifikasi, CLOSED
- [-] Semua guard (login, MFA, backup-config, contact, pageNav, admin-mutasi) ambil IP
      dari `cf-connecting-ip`; `Astro.clientAddress` tidak dipakai (komentar lama benar).
- [-] Konfigurasi fail-open/fail-closed per guard sudah konsisten: login/MFA/backup =
      fail-closed; contact/pageNav/admin-mutasi = dulu fail-open, **admin-mutasi kini
      fail-closed (0.f)**.
- Estimasi: tidak butuh tindakan.

### 1.e — Middleware order of operations — DIVERIFIKASI 2026-08-18, CLOSED
- [-] Urutan terverifikasi di `src/middleware.ts`:
      1. Aset statis `/_astro/*` + favicon → langsung (tanpa rate limit),
      2. `pageNavigationGuard` (fail-open) HANYA untuk halaman HTML non-API non-error —
         API endpoint TIDAK ikut guard ini (punya guard sendiri yang lebih ketat),
      3. Supabase session validasi (getUser + profile),
      4. Guard `/admin` (redirect login / 403 role).
- [-] Tidak ada leak: API mutasi tidak pernah melewati pageNav; pageNav fail-open tidak
      bisa menekan admin secara permanen.
- Estimasi: tidak butuh tindakan.

### 1.f — Data retention: angka aneh (12 minggu Drive vs 12 bulan contact) — CLOSED
- [-] Bukan bug: 12 minggu = rotasi salinan off-site (snapshot cadangan Drive) lebih cepat
      daripada data operasional (contact 12 bulan). Beda tujuan, beda siklus.
- Estimasi: tidak butuh tindakan.

### 1.g — `gdrive-backup.mjs`: audit log retensi Drive tidak ada — **PASCA-LIVE**
- [ ] Tambah path log baru `DRIVE_LOG_FILE` (env var, mis. `gdrive-backup/audit.log` di
      artifact): timestamp, action (upload/delete/error), filename, size, Drive file ID, note.
- [ ] Bucket state dump: file JSON per run di-upload ke artifact (mirror pola
      `db-backup.yml`).
- Estimasi: **PASCA-LIVE** — backup off-site baru efektif setelah live; tanpa log ini
  retensi 12 minggu tidak dapat diaudit (prioritas menengah).

---

## 2.x — Security hardening tambahan (PRIORITAS 2: sebaiknya)

### 2.a — Cache-Control & ETag — DIVERIFIKASI, CLOSED
- [-] Halaman publik: `Cache-Control: public, max-age=0, must-revalidate` + ETag (OK).
- [-] Aset `/_astro/*`: `public, max-age=31536000, immutable` (dari adapter) (OK).
- Estimasi: tidak butuh tindakan.

### 2.b — Referrer-Policy `no-referrer` khusus halaman admin — **PASCA-LIVE**
- [ ] Set header `Referrer-Policy: no-referrer` hanya untuk `/admin/*` di middleware
      (semua admin SSR; `_headers` statis tidak menyentuhnya).
- [ ] Non-admin tetap `strict-origin-when-cross-origin` (saat ini di `SECURITY_HEADERS`).
- Estimasi: **PASCA-LIVE** — hardening opsional; halaman admin hanya dipakai satu admin
  dengan sesi MFA.

### 2.c — Hardening upload PDF: deteksi JS embedded — **PASCA-LIVE**
- [ ] Pada path upload (Workers): scan stream PDF dengan regex `\/JavaScript` / `\/JS`
      (dictionary name) → tolak upload, respons `"pdf_js_detected"` + `console.error`
      (server-side saja, TANPA tabel baru / SQL migration).
- [ ] Opsional: sanitasi `qpdf`/`pdfcpu` di jalur backup/archival GitHub Actions
      (feasible di CI, bukan di Workers).
- Estimasi: **PASCA-LIVE** — uploader tunggal = admin terautentikasi MFA; mitigasi
  berlapis cukup.

### 2.d — Workers Analytics Engine — SKIP
- [-] Opsional; tidak dibutuhkan saat ini.
- Estimasi: tidak dikerjakan.

### 2.e — CORS policy endpoint API — DIVERIFIKASI (kode), verifikasi curl pra-deploy
- [-] `json()` helper (`src/lib/api.ts`) TIDAK menambahkan header CORS apa pun; middleware
      juga tidak → tidak ada `Access-Control-Allow-Origin` → browser blokir semua
      cross-origin fetch (aman by default; same-origin tidak butuh CORS).
- [ ] Konfirmasi curl pra-deploy:
      `curl -v -H "Origin: http://evil.com" http://localhost:4321/api/contact`
      → harus TIDAK ada header `Access-Control-Allow-Origin` (echo atau `*`).
- Estimasi: verifikasi menit-an; bukan blocker (kode sudah menjamin tidak ada ACAO).

---

## 3.x — Nice-to-have (PRIORITAS 3: opsional)

### 3.a — Artifact workflow preview — **PASCA-LIVE**
- [ ] Publish preview artifact of build ke workflow.
- Estimasi: **PASCA-LIVE** — kosmetik DevOps.

### 3.b — Chaos engineering / serverless testing — SKIP
- [-] Opsional; tidak dikerjakan.

### 3.c — SRI untuk script Turnstile — SKIP (dengan alasan terdokumentasi)
- [-] Turnstile tidak menyediakan hash SRI stabil; alasan lengkap di halaman `/security`.
- Estimasi: tidak dikerjakan.

### 3.d — HSTS preload pada custom domain — **PASCA-LIVE** (by definition)
- [ ] Setelah domain `portofolio.indyadirak.my.id` aktif + SSL + HSTS terverifikasi,
      submit ke https://hstspreload.org.
- Estimasi: **PASCA-LIVE** — menunggu DNS/SSL manual user.

---

## Perintah verifikasi wajib di sesi pra-deploy

- [ ] `curl -svL --max-redirs 10 http://localhost:4321//admin` — uji double-slash redirect (1.c)
- [ ] `curl -v -H "Origin: http://evil.com" http://localhost:4321/api/contact` — uji CORS (2.e)
- [ ] `curl -I http://localhost:4321/admin` — cek header admin (Referrer-Policy jadi
      `no-referrer` setelah 2.b dikerjakan)
- [ ] `git log --oneline -5` + `git log origin/main --oneline -5` — verifikasi sinkronisasi
      sebelum memulai deploy

## Ringkasan prioritas saat ini

- **BLOCKER (harus selesai sebelum deploy):** hanya 1.a (rahasia KV ID di wrangler.toml).
- **Verifikasi cepat pra-deploy (menit-an, bukan blocker):** 1.c, 2.e (+ perintah curl di atas).
- **PASCA-LIVE:** 1.b, 1.g, 2.b, 2.c, 3.a, 3.d.
- **CLOSED (selesai/diverifikasi/skip):** 0.a–0.f, 1.d, 1.e, 1.f, 2.a, 2.d, 3.b, 3.c.
