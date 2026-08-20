-- Migration: project-categories
-- ============================================================
-- B2: Dynamic Project Categories
--
-- 1) Tabel project_categories (sumber kebenaran kategori proyek).
-- 2) Seed 14 kategori awal (existing 8 + 6 baru) — idempotent.
-- 3) projects.category_id FK nullable (ON DELETE SET NULL) —
--    kolom category text DI-PERTAHANKAN sebagai fallback legacy.
-- 4) DROP CHECK constraint category (fix bug "Defensive" — TS
--    mengizinkan, DB menolak).
-- 5) RLS + GRANT (pola tabel lain).
-- 6) Trigger updated_at (pola tabel lain di 00-full-migration.sql).
--
-- Idempotent: aman dijalankan ulang via SQL Editor.

-- ============================================================
-- 1) TABEL PROJECT_CATEGORIES
-- ============================================================
create table if not exists public.project_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null,
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Unique di name & slug (tanpa ini, ON CONFLICT di bawah tidak berfungsi).
alter table public.project_categories
  drop constraint if exists project_categories_name_key;
alter table public.project_categories
  add constraint project_categories_name_key unique (name);

alter table public.project_categories
  drop constraint if exists project_categories_slug_key;
alter table public.project_categories
  add constraint project_categories_slug_key unique (slug);

-- ============================================================
-- 2) SEED 14 KATEGORI AWAL (idempotent)
-- ============================================================
insert into public.project_categories (name, slug, description, sort_order, is_active) values
  ('Web App',              'web-app',              'Aplikasi berbasis web.',                10, true),
  ('Mobile',               'mobile',               'Aplikasi mobile.',                      20, true),
  ('Network',              'network',              'Infrastruktur jaringan.',               30, true),
  ('IoT',                  'iot',                  'Internet of Things.',                   40, true),
  ('Red Team',             'red-team',             'Simulasi serangan ofensif.',            50, true),
  ('Blue Team',            'blue-team',            'Pertahanan dan monitoring.',            60, true),
  ('Defensive',            'defensive',            'Kontrol pertahanan keamanan.',          70, true),
  ('OSINT',                'osint',                'Open-source intelligence.',             80, true),
  ('Forensics',            'forensics',            'Digital forensics & incident response.', 90, true),
  ('Cloud Security',       'cloud-security',       'Keamanan lingkungan cloud.',            100, true),
  ('Malware Analysis',     'malware-analysis',     'Analisis statis & dinamis malware.',     110, true),
  ('Active Directory',     'active-directory',     'Audit & hardening Active Directory.',    120, true),
  ('Security Automation',  'security-automation',  'Otomatisasi operasi keamanan.',          130, true),
  ('Incident Response',    'incident-response',    'Respon & pemulihan insiden.',           140, true)
on conflict (name) do nothing;

-- ============================================================
-- 3) MODIFIKASI TABEL PROJECTS
-- ============================================================
-- Kolom FK baru (nullable — proyek lama tanpa kategori_id tetap valid,
-- baca fallback ke kolom category text).
alter table public.projects
  drop column if exists category_id;
alter table public.projects
  add column category_id uuid references public.project_categories(id) on delete set null;

-- Index untuk JOIN (performa filter kategori).
drop index if exists projects_category_id_idx;
create index projects_category_id_idx on public.projects (category_id);

-- DROP CHECK constraint category — kategori kini DINAMIS dari tabel
-- project_categories. Fix bug "Defensive": kode TS mengizinkan nilai
-- ini tapi DB menolak (insert gagal 403). Setelah constraint dihapus,
-- kategori anyar bebas, dan RLS/API memvalidasi via FK.
alter table public.projects
  drop constraint if exists projects_category_check;

-- ============================================================
-- 4) TRIGGER UPDATED_AT (pola tabel lain di 00-full-migration.sql)
-- ============================================================
create or replace function public.set_updated_at_project_categories()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_categories_set_updated_at on public.project_categories;
create trigger project_categories_set_updated_at
  before update on public.project_categories
  for each row execute function public.set_updated_at_project_categories();

-- ============================================================
-- 5) RLS — deny by default, lalu policy eksplisit
-- ============================================================
alter table public.project_categories enable row level security;

drop policy if exists "project_categories_public_read" on public.project_categories;
create policy "project_categories_public_read" on public.project_categories
  for select using (is_active = true);

-- Admin/editor: baca SEMUA (termasuk non-aktif) + kelola.
drop policy if exists "project_categories_auth_manage_read" on public.project_categories;
create policy "project_categories_auth_manage_read" on public.project_categories
  for select to authenticated
  using (true);

drop policy if exists "project_categories_insert_mfa_admin_editor" on public.project_categories;
create policy "project_categories_insert_mfa_admin_editor" on public.project_categories
  for insert to authenticated
  with check (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

drop policy if exists "project_categories_update_mfa_admin_editor" on public.project_categories;
create policy "project_categories_update_mfa_admin_editor" on public.project_categories
  for update to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

drop policy if exists "project_categories_delete_mfa_admin" on public.project_categories;
create policy "project_categories_delete_mfa_admin" on public.project_categories
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
-- 6) GRANT
-- ============================================================
grant select on public.project_categories to anon, authenticated;
grant insert, update, delete on public.project_categories to authenticated;

-- NOTA: kolom category pada projects tetap text (fallback legacy).
-- Setelah CHECK di-drop, nilai legacy apa pun valid; proyek baru
-- sebaiknya mengisi category_id (API mengisi category text otomatis
-- dari nama kategori FK saat kategori dipilih).