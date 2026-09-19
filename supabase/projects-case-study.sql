-- ============================================================
-- MIGRASI: projects — struktur Security Case Study (SPRINT 1)
--
-- Menambahkan tiga kolom naratif agar project publik dapat disajikan
-- sebagai case study utuh dengan urutan yang dicari recruiter keamanan:
--
--   Overview     -> kolom lama `problem`   (tidak berubah)
--   Methodology  -> kolom baru `methodology`
--   Attack Path  -> kolom baru `attack_path`
--   Detection    -> kolom baru `detection`
--   Mitigation   -> kolom lama `solution`  (approach/solution)
--   Impact       -> kolom lama `impact`
--
-- Semua kolom nullable agar project lama tetap valid tanpa migrasi data.
-- Idempotent: aman dijalankan berulang di SQL Editor.
-- ============================================================

alter table public.projects add column if not exists methodology text;
alter table public.projects add column if not exists attack_path text;
alter table public.projects add column if not exists detection text;

-- VERIFIKASI (opsional):
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'projects'
--      and column_name in ('methodology', 'attack_path', 'detection');