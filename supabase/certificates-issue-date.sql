-- ============================================================
-- Certificates upgrade: kolom issue_date (tanggal terbit)
-- Jalankan di Supabase SQL Editor (idempotent — aman dijalankan ulang).
-- Membutuhkan: supabase/rbac-mfa.sql sudah pernah dijalankan
-- (tabel public.certificates sudah ada).
-- ============================================================

-- ------------------------------------------------------------------
-- 1) CERTIFICATES: kolom issue_date (date, WAJIB, default = hari ini)
--    Kolom ini sudah ada sejak rbac-mfa.sql (`issue_date date not null`)
--    dan dipakai end-to-end (API, form admin, grid publik). Upgrade ini
--    hanya menambahkan DEFAULT CURRENT_DATE + memastikan NOT NULL,
--    sehingga INSERT tanpa tanggal terbit otomatis memakai hari ini.
--    Strategi data lama: seluruh row existing sudah NOT NULL (tidak ada
--    NULL yang perlu dibackfill); sekalipun ada NULL (skema lama),
--    backfill memakai created_at::date, bukan CURRENT_DATE, agar tanggal
--    terbit mendekati fakta — bukan tanggal migrasi dijalankan.
-- ------------------------------------------------------------------
alter table public.certificates add column if not exists issue_date date;

update public.certificates
   set issue_date = coalesce(created_at::date, current_date)
 where issue_date is null;

alter table public.certificates alter column issue_date set default current_date;
alter table public.certificates alter column issue_date set not null;

-- ------------------------------------------------------------------
-- 2) GRANT/RLS: TIDAK perlu diubah — kolom baru otomatis ter-cover
--    policy RLS yang SUDAH ADA (SELECT publik certificates_public_read,
--    tulis insert/update mfa_admin_editor) karena policy bekerja di
--    level row, bukan level kolom, dan tidak ada column-level GRANT.
-- ------------------------------------------------------------------
