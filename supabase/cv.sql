-- ============================================================
-- CV/Resume file management (admin GUI)
-- Jalankan di Supabase SQL Editor SETELAH supabase/rbac-mfa.sql
-- (membutuhkan tabel public.profiles untuk cek role).
-- ============================================================

-- ------------------------------------------------------------------
-- 1) BUCKET PUBLIK: cv
--    CV adalah dokumen yang memang untuk publik (diunduh tanpa login),
--    jadi bucket sengaja PUBLIC. Yang dibatasi justru TULIS-nya:
--    insert/update/delete hanya MFA (aal2) + role admin.
-- ------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('cv', 'cv', true)
on conflict (id) do nothing;

-- RLS pada storage.objects sudah aktif default di Supabase (dikelola
-- platform, bukan postgres) — tidak perlu alter table di sini.

-- Insert: MFA (aal2) + role admin.
drop policy if exists "cv_files_insert_mfa_admin" on storage.objects;

create policy "cv_files_insert_mfa_admin" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cv'
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Update: MFA (aal2) + role admin (untuk mengganti file CV yang sama).
drop policy if exists "cv_files_update_mfa_admin" on storage.objects;

create policy "cv_files_update_mfa_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'cv')
  with check (
    bucket_id = 'cv'
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Delete: MFA (aal2) + role admin.
drop policy if exists "cv_files_delete_mfa_admin" on storage.objects;

create policy "cv_files_delete_mfa_admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cv'
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- ------------------------------------------------------------------
-- 2) TABEL: public.cv_files (metadata file CV per bahasa)
--    locale -> 'id' | 'en' (satu file aktif per bahasa).
--    Path di storage SELALU 'cv-<locale>.pdf' (stabil untuk URL publik);
--    nama asli & ukuran disimpan di sini untuk ditampilkan di admin GUI.
-- ------------------------------------------------------------------
create table if not exists public.cv_files (
  locale      text primary key check (locale in ('id', 'en')),
  file_path   text not null,
  file_name   text not null,
  size_bytes  bigint not null,
  mime        text not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.cv_files enable row level security;

-- Select: siapa saja boleh baca metadata (path/versi sudah publik).
drop policy if exists "cv_files_select_public" on public.cv_files;

create policy "cv_files_select_public" on public.cv_files
  for select using (true);

-- Insert/Update/Delete: MFA (aal2) + role admin.
drop policy if exists "cv_files_write_mfa_admin" on public.cv_files;

create policy "cv_files_write_mfa_admin" on public.cv_files
  for all to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- ------------------------------------------------------------------
-- 3) GRANT EKSPLISIT (WAJIB — tabel via SQL Editor tidak otomatis
--    punya grant; tanpa grant anon/authenticated ditolak sebelum
--    policy RLS dievaluasi).
-- ------------------------------------------------------------------
grant select on public.cv_files to anon, authenticated;
grant insert, update, delete on public.cv_files to authenticated;
