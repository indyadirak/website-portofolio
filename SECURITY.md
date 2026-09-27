# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |

Hanya branch `main` yang menerima pembaruan keamanan.

## Reporting a Vulnerability

Jika kamu menemukan kerentanan keamanan di proyek ini, **jangan** buka issue publik. Satu-satunya jalur resmi pelaporan adalah **GitHub Private Vulnerability Reporting**:

- https://github.com/indyadirak/website-portofolio/security/advisories/new

Laporan akan ditinjau oleh pemilik repository.

Sertakan dalam laporan:

- Deskripsi kerentanan dan dampak yang mungkin terjadi
- Langkah untuk mereproduksi (jika memungkinkan, buat PoC)
- Versi yang terpengaruh
- Versi yang sudah diperbaiki (jika sudah ada fix)

### Timeline

- Konfirmasi penerimaan laporan: maksimal 48 jam
- Update status setiap 72 jam
- Rilis perbaikan: secepat mungkin, tergantung tingkat keparahan

Kami akan menghapus atau meminta izin sebelum mempublikasikan detail kerentanan di mana pun, dan memberi kredit pada pelapor (jika diinginkan) setelah masalah diperbaiki.

## Praktik Keamanan Proyek

- **Dependabot**: alert kerentanan dependensi npm + PR update rutin bulanan (version updates)
- **CodeQL**: manual-only (`workflow_dispatch`) — repo private tanpa GitHub Advanced Security sehingga upload SARIF otomatis selalu ditolak GitHub; lihat `.github/workflows/codeql.yml`
- **Dependency Review**: audit perubahan dependency pada tiap PR ke `main` — PR gagal jika ada dependency baru berkerentanan level high/critical (lihat `.github/workflows/dependency-review.yml`)
- **CODEOWNERS**: perubahan pada schema SQL, halaman admin, middleware, auth, workflow, dan `_headers` wajib di-review pemilik
- **CSP ketat**: security headers diterapkan di middleware (runtime), tanpa `unsafe-inline` untuk script/style; `public/_headers` hanya fallback aset statis
- **MFA wajib** untuk role admin/editor (`aal2`) via Supabase
- **RBAC**: RLS di Supabase sebagai penegak utama izin data
- **Validasi upload server-side**: magic bytes + limit 5 MB
- **Request tracking**: `X-Request-ID` (UUID) di semua respons SSR via middleware; respons statis memakai `cf-ray` edge
- **Server header**: dihapus di level Worker; penghapusan penuh `Server: cloudflare` lewat Transform Rule dashboard (lihat `docs/DEPLOYMENT.md` §11)
