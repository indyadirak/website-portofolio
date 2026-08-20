-- Migration: writeups table
-- ============================================================
-- CMS Write-ups (TryHackMe / HackTheBox / CTF)
--
-- Tabel publik.writeups menyimpan laporan penyelesaian lab CTF
-- dengan format TERSTRUKTUR (bukan rich-text bebas):
--   - target_env    : nama lab/mesin (mis. "HTB Machine X")
--   - methodology   : kerangka kerja (mis. OWASP / MITRE ATT&CK)
--   - severity      : Critical | High | Med | Low
--   - findings      : temuan teknis (text)
--   - remediation   : langkah perbaikan / pelajaran (text)
--
-- RLS deny-by-default, SAMA dengan pola tabel lain di repo ini:
--   - SELECT publik (anon + authenticated): hanya is_published = true
--   - INSERT/UPDATE: aal2 (MFA TOTP) + role admin/editor
--   - DELETE      : aal2 (MFA TOTP) + role admin saja
--   - Viewer      : baca published saja (default deny untuk mutasi)
--
-- Idempotent: aman dijalankan berulang (IF NOT EXISTS + drop policy).
-- ============================================================

-- ------------------------------------------------------------------
-- 1) TABEL
-- ------------------------------------------------------------------
create table if not exists public.writeups (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  slug         text not null unique,
  target_env   text not null,
  methodology  text not null,
  severity     text not null
               check (severity in ('Critical', 'High', 'Med', 'Low')),
  findings     text not null,
  remediation  text not null,
  is_published boolean not null default false,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- 2) ROW LEVEL SECURITY (WAJIB: tanpa ini semua policy tidak berlaku)
-- ------------------------------------------------------------------
alter table public.writeups enable row level security;

-- ------------------------------------------------------------------
-- 3) POLICIES
-- ------------------------------------------------------------------

-- 3a. SELECT publik: HANYA write-up yang diterbitkan.
drop policy if exists "writeups_public_read" on public.writeups;

create policy "writeups_public_read" on public.writeups
  for select
  to anon, authenticated
  using (is_published = true);

-- 3a2. SELECT untuk role pengelola (admin/editor): semua baris termasuk
--      draft — diperlukan agar UI admin dapat menampilkan & mengedit
--      write-up yang belum diterbitkan. Viewer tetap hanya melihat
--      published via policy 3a (RLS bersifat OR antar policy permissive).
drop policy if exists "writeups_auth_manage_read" on public.writeups;

create policy "writeups_auth_manage_read" on public.writeups
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

-- 3b. INSERT: MFA terverifikasi (aal2) + role admin/editor.
drop policy if exists "writeups_insert_mfa_admin_editor" on public.writeups;

create policy "writeups_insert_mfa_admin_editor" on public.writeups
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

-- 3c. UPDATE: klausa USING dan WITH CHECK keduanya mensyaratkan
--     aal2 + role admin/editor. Penulis (created_by) juga boleh
--     mengubah write-up miliknya selama punya role manage.
drop policy if exists "writeups_update_mfa_admin_editor" on public.writeups;

create policy "writeups_update_mfa_admin_editor" on public.writeups
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

-- 3d. DELETE: HANYA MFA terverifikasi (aal2) + role admin.
drop policy if exists "writeups_delete_mfa_admin" on public.writeups;

create policy "writeups_delete_mfa_admin" on public.writeups
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

-- ------------------------------------------------------------------
-- 4) GRANT EKSPLISIT (WAJIB! tabel via SQL Editor tidak punya GRANT
--    otomatis). Konsisten dengan pola rbac-mfa.sql:
--    - anon          : SELECT published saja.
--    - authenticated : SELECT published + mutasi (keputusan di RLS).
-- ------------------------------------------------------------------
grant select on public.writeups to anon, authenticated;
grant insert, update, delete on public.writeups to authenticated;