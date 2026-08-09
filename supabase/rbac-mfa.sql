-- ============================================================
-- RBAC + MFA untuk website-portofolio
-- Jalankan SEMUA script ini di Supabase SQL Editor (sekali eksekusi).
-- ============================================================

-- ------------------------------------------------------------------
-- 1) TABEL: public.profiles
--    id -> auth.users(id): setiap user auth tepat punya 1 profil.
--    role: admin | editor | viewer   |   mfa_enforced: boolean
-- ------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text,
  avatar_url   text,
  role         text not null default 'viewer'
               check (role in ('admin', 'editor', 'viewer')),
  mfa_enforced boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- 2) TABEL: public.certificates
-- ------------------------------------------------------------------
create table if not exists public.certificates (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  issuer        text not null,
  issue_date    date not null,
  expiry_date   date,
  credential_id text unique,
  credential_url text,
  skills        text[] not null default '{}',
  description   text,
  file_url      text,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- 3) AKTIFKAN ROW LEVEL SECURITY (WAJIB!)
--    Tanpa ini seluruh policy di bawah TIDAK BERLAKU.
-- ------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.certificates enable row level security;

-- ------------------------------------------------------------------
-- 4) POLICIES: public.certificates
-- ------------------------------------------------------------------

-- 4a. SELECT publik tanpa syarat (anon + authenticated).
drop policy if exists "certificates_public_read" on public.certificates;

create policy "certificates_public_read" on public.certificates
  for select
  to anon, authenticated
  using (true);

-- 4b. INSERT: HANYA user dengan MFA terverifikasi (aal2) DAN role admin/editor.
drop policy if exists "certificates_insert_mfa_admin_editor" on public.certificates;

create policy "certificates_insert_mfa_admin_editor" on public.certificates
  for insert
  to authenticated
  with check (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

-- 4c. UPDATE: policy terpisah — klausa USING DAN WITH CHECK
--     KEDUANYA mensyaratkan aal2 + role admin/editor.
drop policy if exists "certificates_update_mfa_admin_editor" on public.certificates;

create policy "certificates_update_mfa_admin_editor" on public.certificates
  for update
  to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  )
  with check (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

-- 4d. DELETE: HANYA MFA terverifikasi (aal2) DAN role admin.
drop policy if exists "certificates_delete_mfa_admin" on public.certificates;

create policy "certificates_delete_mfa_admin" on public.certificates
  for delete
  to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Catatan viewer: tidak ada policy khusus — viewer TIDAK dapat INSERT/UPDATE/DELETE
-- (tidak ada policy yang mengizinkan), hanya bisa SELECT via policy 4a.
-- Viewer tidak butuh MFA karena tidak pernah menyentuh operasi mutasi.

-- ------------------------------------------------------------------
-- 5) POLICIES: public.profiles
--    WAJIB: setiap user boleh membaca baris profilnya sendiri.
--    Tanpa policy ini, semua subquery cek role di atas selalu kosong
--    (RLS memblokir pembacaan profiles) sehingga admin/editor akan
--    ditolak melakukan mutasi apa pun meski MFA & kredensial benar.
-- ------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- PERINGATAN KEAMANAN:
-- JANGAN membuat policy UPDATE/INSERT pada profiles untuk self-service.
-- Policy seperti "profiles_update_own" (user mengedit barisnya sendiri)
-- akan memungkinkan privilege escalation (viewer mengubah role-nya jadi admin).
-- Perubahan role / mfa_enforced hanya via Supabase Dashboard (lihat bawah).

-- ------------------------------------------------------------------
-- 5.5) GRANT EKSPLISIT (WAJIB!)
--      Tabel yang dibuat via SQL Editor TIDAK otomatis memiliki GRANT.
--      Tanpa grant, anon/authenticated ditolak di level tabel SEBELUM
--      policy RLS sempat dievaluasi. Grant di sini sengaja minimal:
--      - anon:          hanya SELECT certificates (kartu publik).
--      - authenticated: SELECT certificates + SELECT profil sendiri.
--      Mutasi (INSERT/UPDATE/DELETE) tetap diputuskan policy RLS aal2.
--      profiles sengaja TIDAK di-grant ke anon (data private).
-- ------------------------------------------------------------------
grant select on public.certificates to anon, authenticated;
grant select on public.profiles to authenticated;
grant insert, update, delete on public.certificates to authenticated;

-- ------------------------------------------------------------------
-- 6) TRIGGER: auto-create profil saat user auth baru terdaftar.
--    AFTER INSERT pada auth.users -> buat baris public.profiles
--    dengan role default 'viewer' dan mfa_enforced default false.
--    Mencegah user auth tanpa profil (semua cek role RLS akan gagal).
-- ------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, mfa_enforced)
  values (new.id, 'viewer', false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Catatan: `security definer` + `set search_path = public` diperlukan agar
-- fungsi bisa INSERT ke profiles (yang terlindung RLS) dan aman dari
-- search-path hijacking. `on conflict do nothing` membuat script idempotent.
