-- Migration: experiences
-- ============================================================
-- FASE 2 (Career-Proof): Career Timeline
--
-- Tabel experiences = riwayat karir (role, company, periode) yang
-- ditampilkan sebagai Career Timeline dan diedit via Dashboard
-- Admin — tanpa mengubah kode.
--
-- 1) Tabel experiences (idempotent).
-- 2) RLS + GRANT (pola tabel lain).
-- 3) Trigger updated_at (pola tabel lain di 00-full-migration.sql).
--
-- Idempotent: aman dijalankan ulang via SQL Editor.

-- ============================================================
-- 1) TABEL EXPERIENCES
-- ============================================================
create table if not exists public.experiences (
  id          uuid primary key default gen_random_uuid(),
  role        text not null,
  company     text not null,
  start_date  date not null,
  end_date    date,
  is_current  boolean not null default false,
  description text not null default '',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Index urutan tampilan timeline.
drop index if exists experiences_sort_order_idx;
create index experiences_sort_order_idx on public.experiences (sort_order);

-- ============================================================
-- 2) TRIGGER UPDATED_AT (pola tabel lain di 00-full-migration.sql)
-- ============================================================
create or replace function public.set_updated_at_experiences()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists experiences_set_updated_at on public.experiences;
create trigger experiences_set_updated_at
  before update on public.experiences
  for each row execute function public.set_updated_at_experiences();

-- ============================================================
-- 3) RLS — deny by default, lalu policy eksplisit
--    Public: baca semua. Admin/Editor (AAL2): tulis. Admin: hapus.
-- ============================================================
alter table public.experiences enable row level security;

drop policy if exists "experiences_public_read" on public.experiences;
create policy "experiences_public_read" on public.experiences
  for select using (true);

drop policy if exists "experiences_auth_manage_read" on public.experiences;
create policy "experiences_auth_manage_read" on public.experiences
  for select to authenticated
  using (true);

drop policy if exists "experiences_insert_mfa_admin_editor" on public.experiences;
create policy "experiences_insert_mfa_admin_editor" on public.experiences
  for insert to authenticated
  with check (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

drop policy if exists "experiences_update_mfa_admin_editor" on public.experiences;
create policy "experiences_update_mfa_admin_editor" on public.experiences
  for update to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

drop policy if exists "experiences_delete_mfa_admin" on public.experiences;
create policy "experiences_delete_mfa_admin" on public.experiences
  for delete to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- ============================================================
-- 4) GRANT
-- ============================================================
grant select on public.experiences to anon, authenticated;
grant insert, update, delete on public.experiences to authenticated;