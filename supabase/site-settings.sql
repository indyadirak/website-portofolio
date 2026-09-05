-- Migration: site-settings
-- ============================================================
-- FASE 2 (Career-Proof): Dynamic Site Identity
--
-- Tabel site_settings = sumber kebenaran identitas utama website
-- (hero_title, hero_tagline, short_bio, availability_status) yang
-- diedit via Dashboard Admin — tanpa mengubah kode.
--
-- 1) Tabel key/value (idempotent).
-- 2) Seed awal: nilai default identik dengan src/lib/config.ts /
--    src/lib/i18n saat ini (FASE 3 akan membaca dari tabel ini,
--    config.ts menjadi fallback legacy).
-- 3) RLS + GRANT (pola tabel lain).
-- 4) Trigger updated_at (pola tabel lain di 00-full-migration.sql).
--
-- Idempotent: aman dijalankan ulang via SQL Editor.

-- ============================================================
-- 1) TABEL SITE_SETTINGS
-- ============================================================
create table if not exists public.site_settings (
  id         uuid primary key default gen_random_uuid(),
  key        text not null,
  value      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_settings
  drop constraint if exists site_settings_key_key;
alter table public.site_settings
  add constraint site_settings_key_key unique (key);

-- ============================================================
-- 2) SEED DEFAULT (idempotent — DO NOTHING: nilai yang sudah
--    diedit admin TIDAK ditimpa saat re-run)
-- ============================================================
insert into public.site_settings (key, value) values
  ('hero_title',          'Network & Cyber Security Technician'),
  ('hero_tagline',        'Network & Cyber Security Portfolio'),
  ('short_bio',           'Penetration testing, security research, dan blue team defense — membangun sistem yang aman sejak awal.'),
  ('availability_status', 'open-to-work'),
  ('about_bio',           ''),
  ('about_specializations', '[]'),
  ('about_contact_info',  '')
on conflict (key) do nothing;

-- ============================================================
-- 3) TRIGGER UPDATED_AT (pola tabel lain di 00-full-migration.sql)
-- ============================================================
create or replace function public.set_updated_at_site_settings()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at_site_settings();

-- ============================================================
-- 4) RLS — deny by default, lalu policy eksplisit
--    Public: baca semua. Admin/Editor (AAL2): tulis. Admin: hapus.
-- ============================================================
alter table public.site_settings enable row level security;

drop policy if exists "site_settings_public_read" on public.site_settings;
create policy "site_settings_public_read" on public.site_settings
  for select using (true);

drop policy if exists "site_settings_auth_manage_read" on public.site_settings;
create policy "site_settings_auth_manage_read" on public.site_settings
  for select to authenticated
  using (true);

drop policy if exists "site_settings_insert_mfa_admin_editor" on public.site_settings;
create policy "site_settings_insert_mfa_admin_editor" on public.site_settings
  for insert to authenticated
  with check (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

drop policy if exists "site_settings_update_mfa_admin_editor" on public.site_settings;
create policy "site_settings_update_mfa_admin_editor" on public.site_settings
  for update to authenticated
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

drop policy if exists "site_settings_delete_mfa_admin" on public.site_settings;
create policy "site_settings_delete_mfa_admin" on public.site_settings
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
-- 5) GRANT
-- ============================================================
grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;
