# ARCHITECTURE — Desain Teknis & Keamanan

## 1. Arsitektur High-Level

```
                    ┌────────────────────────────────────────────┐
 Pengunjung ──────▶ │ CLOUDFLARE (edge)                          │
                    │   └─ Workers: Astro SSR (dist/server)      │
 Admin  ─────────▶ │       ├─ middleware.ts                      │
                    │       │   (CSP + headers, rate limit nav,  │
                    │       │    session, guard /admin)          │
                    │       ├─ pages/*.astro (SSR/prerender)     │
                    │       └─ pages/api/* (endpoint)            │
                    │   └─ KV: rate limiting + session           │
                    └───────┬──────────────────┬─────────────────┘
                            │                  │
                 ┌──────────▼─────────┐  ┌─────▼──────────────────────┐
                 │ SUPABASE           │  │ GITHUB ACTIONS             │
                 │ ├─ Auth (TOTP/aal2)│  │ ├─ deploy.yml (auto main)  │
                 │ ├─ Postgres (RLS)  │  │ ├─ db-backup.yml (GPG)     │
                 │ └─ Storage (objek) │  │ ├─ data-retention.yml      │
                 └────────────────────┘  │ ├─ codeql / sbom / dep-rvw │
                                         │ └─ gdrive offload (3-2-1)  │
                                         └────────────────────────────
```

- **Astro 7** pada **Cloudflare Workers**: halaman admin + API = SSR;
  beberapa halaman publik (mis. `/certificates`) = prerender (statik).
- **Cloudflare KV** untuk state rate limiting (edge-consistent) dan session.
- **Supabase** satu proyek: Auth (PKCE + cookie via `@supabase/ssr`),
  PostgreSQL dengan RLS, Storage (bucket `certificates` privat, `cv` publik).
- **GitHub Actions**: deploy otomatis, backup, retensi data, SAST (CodeQL),
  SBOM, dependency review.

## 2. Desain Keamanan (Defense-in-Depth)

| Lapisan | Mekanisme | Referensi |
|---|---|---|
| Edge/Transport | CSP ketat (tanpa `unsafe-eval`; `unsafe-inline` hanya dev), HSTS preload, `X-Frame-Options DENY`, `frame-ancestors 'none'`, Permissions-Policy | `src/middleware.ts`, `public/_headers` |
| Rate limiting | Per-IP & per-IP+email; lockout progresif 15 m → 4 jam; fail-closed untuk endpoint sensitif (login, MFA, backup-config, admin mutasi) | `src/lib/rateLimit.ts` |
| Auth | PKCE + cookie httpOnly; MFA TOTP wajib (aal2) untuk admin/editor; anti enumerasi email | `src/pages/api/auth/*` |
| **Database (penegak utama)** | RLS deny-by-default; mutasi = `aal2` + **role via subquery `public.profiles`** (JANGAN klaim JWT) | `supabase/*.sql` |
| API (defense-in-depth) | Cek ulang session + role (`can*` di `src/lib/auth.ts`) + `adminMutationGuard` + validasi input (UUID, panjang, enum) | `src/pages/api/admin/*` |
| Upload | Allowlist MIME + **magic bytes** + maks 5 MB + path acak tervalidasi shape + rollback file yatim | `src/lib/storage.ts` |
| Endpoint sensitif | `/api/backup-config` (fetch kredensial Drive): Bearer token + timing-safe compare + rate limit + audit | `src/pages/api/backup-config.ts` |
| Data | Enkripsi at-rest (AES-256-GCM) untuk kredensial Drive; backup GPG; retensi terjadwal (PII 12 bulan, audit 90 hari) | `data-retention.yml`, `db-backup.yml` |
| Rantai pasokan | CodeQL, dependency review, SBOM (Syft), actions pinned ke SHA + permissions least-privilege | `.github/workflows/*` |

### Edge Security — Cloudflare

Minimum TLS Version pada **Cloudflare Zone Settings** harus diset ke **TLS
1.2**. Konfigurasi edge ini mematikan TLS 1.0 dan TLS 1.1 yang deprecated;
aplikasi tidak mengubah versi TLS melalui kode Astro atau Worker.

**RBAC matrix (ringkas):**

| Aksi | viewer | editor | admin |
|---|---|---|---|
| Baca konten admin (dashboard, list, pesan) | ✅ | ✅ | ✅ |
| Mutasi konten (projects, certificates, settings, write-ups, pesan) | ❌ | ✅ (aal2) | ✅ (aal2) |
| Hapus konten | ❌ | ❌ | ✅ (aal2) |
| Halaman `/admin/backup`, `/admin/cv` | ❌ | ❌ | ✅ |
| Ubah role / `mfa_enforced` | ❌ | ❌ | hanya via Supabase Dashboard (disengaja) |

## 3. Struktur Database (tabel utama, schema `public`)

| Tabel | Isi | RLS tulis |
|---|---|---|
| `profiles` | id→auth.users, `role` (admin/editor/viewer), `mfa_enforced` | read own; tanpa policy tulis (anti privilege escalation) |
| `projects` | project + FK `category_id` + struktur problem/solution/impact | aal2 + admin/editor (hapus: admin) |
| `project_categories` | kategori dinamis (seed 14, `is_active`) | aal2 + admin/editor |
| `skills` | skill + kategori + level | aal2 + admin/editor |
| `certificates` | sertifikat, kategori, featured, `verification_url`, `file_url` | aal2 + admin/editor (hapus: admin) |
| `contact_messages` | PII pengunjung + `is_read` | insert publik; select semua role login; update/delete aal2 + admin/editor |
| `writeups` | case study CTF terstruktur + `is_published` | aal2 + admin/editor |
| `site_settings` | key/value identitas (hero, tagline, bio, availability) | aal2 + admin/editor (hapus: admin) |
| `experiences`, `social_links` | career timeline, tautan sosial | aal2 + admin/editor |
| `cv_files` | metadata CV per bahasa (PK `locale` id/en) | aal2 + admin |
| `backup_config` | single-row: kredensial Drive (ciphertext) + folder id | aal2 + admin |
| `login_attempts` | audit login (success/failed/blocked), retensi 90 hari | select admin; tulis via RPC `record_login_attempt` (SECURITY DEFINER) |
| `backup_config_access_log` | audit akses kredensial backup, retensi 90 hari | select admin; tulis via endpoint service-role |

**Pola policy mutasi (kanonik):**
```sql
(select auth.jwt() ->> 'aal') = 'aal2'
and exists (
  select 1 from public.profiles
  where profiles.id = auth.uid()
    and profiles.role in ('admin', 'editor')   -- atau 'admin' untuk hapus
)
```

## 4. Alur Data (contoh)

### 4.1 Submit form kontak (publik → database)
1. `ContactForm.astro` fetch JSON ke `POST /api/contact` (token Turnstile
   dalam body, bukan formData).
2. Guard berurutan di `src/pages/api/contact.ts`:
   **honeypot** (bot → 200 palsu, tanpa INSERT) → **validasi input**
   (panjang, regex email) → **Turnstile siteverify** (server-side, fail
   closed bila misconfig) → **rate limit KV** (3 submit/IP/10 menit).
3. INSERT via anon client → lolos karena policy `contact_messages_public_insert`
   (`with check (true)`). Respons: `{ok:true}` generik.
4. Retensi: purge otomatis > 12 bulan (`data-retention.yml`); backup mingguan
   ikut menyimpan (3-2-1).

### 4.2 Mutasi admin (contoh: tandai pesan dibaca — Fase 2)
1. Klik tombol di `/admin/messages` → `PUT /api/admin/messages?id=<uuid>`.
2. Guard app: session valid → `canManageMessages(profile)` (admin/editor) →
   `adminMutationGuard` (KV, fail-closed, 30 mutasi/menit/user) → validasi UUID.
3. UPDATE via cookie session → RLS `contact_messages_auth_update`
   mensyaratkan `aal2` + role via subquery `profiles`.
4. Gagal di lapisan mana pun → 4xx generik (detail hanya di `console.error`).

### 4.3 Login 3 langkah
`POST /api/auth/login` (password, rate limit per-IP & per-IP+email, audit)
→ step `mfa` (`mfa.challenge` + `mfa.verify` → `setSession` aal2) atau step
`enroll` (TOTP pertama kali untuk admin/editor) → dashboard.
Setiap request: middleware validasi session + ambil profil (role) dari DB.

## 5. Catatan Operasional

- **Urutan SQL instalasi**: `rbac-mfa.sql` PALING AWAL (tabel `profiles`
  dirujuk policy semua tabel lain), sisanya bebas — atau sekali jalan via
  `supabase/00-full-migration.sql` (detail: `docs/DEPLOYMENT.md` §1).
- **Role admin** diset manual di `public.profiles` (Supabase Dashboard);
  tidak ada self-service perubahan role (disengaja, anti escalation).
- **Supabase free tier** auto-pause ~7 hari idle — mitigasi: workflow
  keep-alive (roadmap Fase 2, `TASKS.md`).
- **Halaman prerender** (badge sertifikat, sitemap) hanya diperbarui saat
  deploy — karakteristik desain, bukan bug.
