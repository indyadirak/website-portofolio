-- ============================================================
-- Certificates upgrade: kategori Compliance vs Training
-- Jalankan di Supabase SQL Editor (idempotent — aman dijalankan ulang).
-- Membutuhkan: supabase/rbac-mfa.sql sudah pernah dijalankan
-- (tabel public.certificates sudah ada).
-- ============================================================

-- ------------------------------------------------------------------
-- 1) CERTIFICATES: kolom category (text, wajib, default 'training')
--    - 'compliance' : sertifikat kepatuhan standar (ISO, GDPR, dll)
--    - 'training'   : sertifikat pelatihan teknis / kursus / workshop
--    Default 'training' -> seluruh sertifikat lama otomatis masuk
--    kategori training (tidak ada data yang menjadi NULL).
--    Teknik idempotent (pola public-features.sql):
--    tambah kolom jika belum ada, lalu drop & recreate constraint check
--    agar definisi CHECK selalu sinkron bila migrasi dijalankan ulang.
-- ------------------------------------------------------------------
alter table public.certificates add column if not exists category text not null default 'training';

alter table public.certificates drop constraint if exists certificates_category_check;

alter table public.certificates add constraint certificates_category_check
  check (category in ('compliance', 'training'));

-- ------------------------------------------------------------------
-- 2) GRANT: tidak perlu kolom/bijak baru — kolom category otomatis
--    ter-cover oleh policy RLS SELECT publik (certificates_public_read)
--    dan policy tulis (insert/update mfa_admin_editor) yang SUDAH ADA.
--    SELECT certs sudah di-grant ke anon, authenticated di rbac-mfa.sql.
--    Tidak ada grant tambahan yang wajib di sini.
-- ------------------------------------------------------------------