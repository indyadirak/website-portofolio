-- Migration: social-links
-- ============================================================
-- FASE 2 (Career-Proof): Dynamic Social Links
--
-- Tabel social_links = tautan sosial (github, linkedin, blog) yang
-- ditampilkan di Hero/About dan diedit via Dashboard Admin — tanpa
-- mengubah kode.
--
-- 1) Tabel social_links (idempotent).
-- 2) Seed awal: URL identik dengan src/lib/config.ts (contact.* +
--    blogUrl) — FASE 3 akan membaca dari tabel ini, config.ts
--    menjadi fallback legacy.
-- 3) UNIQUE platform (satu tautan per platform).
-- 4) RLS + GRANT (pola tabel lain).
-- 5) Trigger updated_at (pola tabel lain di 00-full-migration.sql).
--
-- Idempotent: aman dijalankan ulang via SQL Editor.

-- ============================================================
-- 1) TABEL SOCIAL_LINKS
-- ============================================================
create table if not exists public.social_links (
  id         uuid primary key default gen_random_uuid(),
  platform   text not null,
  url        text not null,
  icon       text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Satu tautan per platform (github/linkedin/blog/...).
alter table public.social_links
  drop constraint if exists social_links_platform_key;
alter table public.social_links
  add constraint social_links_platform_key unique (platform);

-- Index urutan tampilan.
drop index if exists social_links_sort_order_idx;
create index social_links_sort_order_idx on public.social_links (sort_order);

-- ============================================================
-- 2) SEED DEFAULT (idempotent — DO NOTHING: tautan yang sudah
--    diedit admin TIDAK ditimpa saat re-run)
-- ============================================================
insert into public.social_links (platform, url, icon, sort_order) values
  ('github',   'https://github.com/indyadirak',         'github',   10),
  ('linkedin', 'https://www.linkedin.com/in/indyadirak', 'linkedin', 20),
  ('blog',     'https://blog.indyadirak.my.id',          'blog',     30)
on conflict (platform) do nothing;

-- ============================================================
-- 3) TRIGGER UPDATED_AT (pola tabel lain di 00-full-migration.sql)
-- ============================================================
create or replace function public.set_updated_at_social_links()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists social_links_set_updated_at on public.social_links;
create trigger social_links_set_updated_at
  before update on public.social_links
  for each row execute function public.set_updated_at_social_links();

-- ============================================================
-- 4) RLS — deny by default, lalu policy eksplisit
--    Public: baca semua. Admin/Editor (AAL2): tulis. Admin: hapus.
-- ============================================================
alter table public.social_links enable row level security;

drop policy if exists "social_links_public_read" on public.social_links;
create policy "social_links_public_read" on public.social_links
  for select using (true);

drop policy if exists "social_links_auth_manage_read" on public.social_links;
create policy "social_links_auth_manage_read" on public.social_links
  for select to authenticated
  using (true);

drop policy if exists "social_links_insert_mfa_admin_editor" on public.social_links;
create policy "social_links_insert_mfa_admin_editor" on public.social_links
  for insert to authenticated
  with check (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

drop policy if exists "social_links_update_mfa_admin_editor" on public.social_links;
create policy "social_links_update_mfa_admin_editor" on public.social_links
  for update to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

drop policy if exists "social_links_delete_mfa_admin" on public.social_links;
create policy "social_links_delete_mfa_admin" on public.social_links
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
grant select on public.social_links to anon, authenticated;
grant insert, update, delete on public.social_links to authenticated;