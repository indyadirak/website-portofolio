-- ============================================================
-- Certificates upgrade: kolom verification_url
-- Jalankan di Supabase SQL Editor (idempotent — aman dijalankan ulang).
-- Membutuhkan: supabase/rbac-mfa.sql sudah pernah dijalankan
-- (tabel public.certificates sudah ada).
-- ============================================================

-- ------------------------------------------------------------------
-- 1) CERTIFICATES: kolom verification_url (text, nullable)
--    URL halaman verifikasi RESMI dari issuer (misal link verifikasi
--    badge Credly / lembaga penerbit). NULL = tidak punya halaman
--    verifikasi online — UI publik tidak menampilkan link apapun.
--    Teknik idempotent (pola certificates-category.sql): tambah kolom
--    hanya jika belum ada.
-- ------------------------------------------------------------------
alter table public.certificates add column if not exists verification_url text;

-- ------------------------------------------------------------------
-- 2) GRANT/RLS: TIDAK perlu diubah — kolom baru otomatis ter-cover
--    policy RLS yang SUDAH ADA (SELECT publik certificates_public_read,
--    tulis insert/update mfa_admin_editor) karena policy bekerja di
--    level row, bukan level kolom, dan tidak ada column-level GRANT
--    yang membatasi akses ke tabel certificates. Data lama:
--    verification_url = NULL (tidak ada link yang muncul).
-- ------------------------------------------------------------------