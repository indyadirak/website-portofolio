-- ============================================================
-- Certificates upgrade: kolom is_featured (sertifikat unggulan)
-- Jalankan di Supabase SQL Editor (idempotent — aman dijalankan ulang).
-- Membutuhkan: supabase/rbac-mfa.sql sudah pernah dijalankan
-- (tabel public.certificates sudah ada).
-- ============================================================

-- ------------------------------------------------------------------
-- 1) CERTIFICATES: kolom is_featured (boolean, wajib, default false)
--    Replikasi pola `featured` di tabel projects (schema.sql): boolean
--    NOT NULL DEFAULT false — data lama otomatis non-featured, tidak
--    ada nilai yang menjadi NULL.
--    Dipakai UI publik untuk badge "Featured" + urutan paling atas.
-- ------------------------------------------------------------------
alter table public.certificates add column if not exists is_featured boolean not null default false;

-- ------------------------------------------------------------------
-- 2) GRANT/RLS: TIDAK perlu diubah — kolom baru otomatis ter-cover
--    policy RLS yang SUDAH ADA (SELECT publik certificates_public_read,
--    tulis insert/update mfa_admin_editor) karena policy bekerja di
--    level row, bukan level kolom, dan tidak ada column-level GRANT.
-- ------------------------------------------------------------------
