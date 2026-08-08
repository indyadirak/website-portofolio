# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |

Hanya branch `main` yang menerima pembaruan keamanan.

## Reporting a Vulnerability

Jika kamu menemukan kerentanan keamanan di proyek ini, **jangan** buka issue publik. Laporkan melalui:

1. **GitHub Private Vulnerability Reporting** (disarankan):
   https://github.com/indyadirak/website-portofolio/security/advisories/new

2. Atau kirim email ke pemilik repository dengan subjek `[SECURITY]`.

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

- **Dependabot**: alert kerentanan dependensi npm + PR update otomatis mingguan
- **CodeQL**: code scanning otomatis pada tiap push/PR ke `main`
- **CSP ketat**: `public/_headers` tanpa `unsafe-inline` untuk script/style
- **MFA wajib** untuk role admin/editor (`aal2`) via Supabase
- **RBAC**: RLS di Supabase sebagai penegak utama izin data
- **Validasi upload server-side**: magic bytes + limit 5 MB
