-- ============================================================
-- Certificates upgrade: kolom expiry_date (tanggal kedaluwarsa)
-- Jalankan di Supabase SQL Editor (idempotent — aman dijalankan ulang).
-- Membutuhkan: supabase/rbac-mfa.sql sudah pernah dijalankan
-- (tabel public.certificates sudah ada).
-- ============================================================

-- ------------------------------------------------------------------
-- 1) CERTIFICATES: kolom expiry_date (date, NULLABLE — wajib boleh
--    kosong; banyak sertifikat tidak punya masa berlaku).
--    Kolom ini sudah ada sejak rbac-mfa.sql; upgrade ini memastikan
--    kolom eksis + selalu nullable (tanpa default) agar definisi
--    konsisten walau skema dasar berubah di masa depan.
--    Data lama: expiry_date = NULL -> UI tidak menampilkan badge
--    status masa berlaku apa pun (per desain, bukan bug).
-- ------------------------------------------------------------------
alter table public.certificates add column if not exists expiry_date date;

alter table public.certificates alter column expiry_date drop not null;

-- ------------------------------------------------------------------
-- 2) GRANT/RLS: TIDAK perlu diubah — kolom baru otomatis ter-cover
--    policy RLS yang SUDAH ADA (SELECT publik certificates_public_read,
--    tulis insert/update mfa_admin_editor) karena policy bekerja di
--    level row, bukan level kolom, dan tidak ada column-level GRANT.
-- ------------------------------------------------------------------
