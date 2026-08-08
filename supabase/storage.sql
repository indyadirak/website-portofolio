-- ============================================================
-- Supabase Storage untuk file sertifikat
-- Jalankan di Supabase SQL Editor SETELAH supabase/rbac-mfa.sql
-- ============================================================

-- ------------------------------------------------------------------
-- 1) BUCKET privat: certificates
--    Bucket privat -> file TIDAK bisa diakses publik langsung;
--    akses melalui signed URL yang dibuat oleh user terautentikasi.
-- ------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('certificates', 'certificates', false)
on conflict (id) do nothing;

-- ------------------------------------------------------------------
-- 2) Aktifkan RLS pada storage.objects (default Supabase sudah aktif,
--    dipastikan ulang agar tidak ada celah).
-- ------------------------------------------------------------------
alter table storage.objects enable row level security;

-- ------------------------------------------------------------------
-- 3) POLICIES storage.objects
--    Model keamanan disamakan dengan tabel certificates:
--    - Read: user terautentikasi (untuk membuat signed URL).
--    - Write (insert): MFA terverifikasi (aal2) + role admin/editor
--      (mirror dari policy insert certificates).
--    - Update: pemilik file (bucket privat per-user path).
--    - Delete: MFA terverifikasi (aal2) + role admin.
-- ------------------------------------------------------------------

-- Read: hanya user login (viewer boleh baca sertifikat, jadi berhak
-- membuat signed URL untuk melihat file).
create policy "certificates_files_select_auth" on storage.objects
  for select to authenticated
  using (bucket_id = 'certificates');

-- Insert: aal2 + role admin/editor — sama ketatnya dengan insert row.
create policy "certificates_files_insert_mfa_admin_editor" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'certificates'
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

-- Update: hanya pemilik file.
create policy "certificates_files_update_owner" on storage.objects
  for update to authenticated
  using (bucket_id = 'certificates' and owner = auth.uid())
  with check (bucket_id = 'certificates' and owner = auth.uid());

-- Delete: MFA (aal2) + role admin — file hanya dihapus saat admin
-- menghapus sertifikat (rollback juga dilakukan via policy ini).
create policy "certificates_files_delete_mfa_admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'certificates'
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
