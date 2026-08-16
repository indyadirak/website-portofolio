-- ============================================================
-- Certificates upgrade: keterangan singkat per bahasa
-- (short_description_id / short_description_en)
-- Jalankan di Supabase SQL Editor (idempotent — aman dijalankan ulang).
-- Membutuhkan: supabase/rbac-mfa.sql sudah pernah dijalankan
-- (tabel public.certificates sudah ada).
-- ============================================================

-- ------------------------------------------------------------------
-- 1) CERTIFICATES: dua kolom terpisah per bahasa (nullable)
--    - short_description_id : keterangan singkat bahasa Indonesia
--    - short_description_en : keterangan singkat bahasa Inggris
--    Pola konten locale-aware SAMA dengan Problem/Solution/Impact di
--    tabel projects (public-features.sql) — dua kolom, bukan satu
--    kolom dengan translasi digabung. NULL = tidak ditampilkan.
--    Batas 150 karakter diberlakukan di form admin + validasi API
--    (server-side), bukan constraint DB — konsisten dengan pola
--    panjang-penuh di kolom description.
-- ------------------------------------------------------------------
alter table public.certificates add column if not exists short_description_id text;
alter table public.certificates add column if not exists short_description_en text;

-- ------------------------------------------------------------------
-- 2) GRANT/RLS: TIDAK perlu diubah — kolom baru otomatis ter-cover
--    policy RLS yang SUDAH ADA (SELECT publik certificates_public_read,
--    tulis insert/update mfa_admin_editor) karena policy bekerja di
--    level row, bukan level kolom, dan tidak ada column-level GRANT.
-- ------------------------------------------------------------------
