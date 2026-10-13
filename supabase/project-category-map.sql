-- Migration: project-category-map (multi-kategori project)
-- ============================================================
-- Batch-4 B1: tabel junction project_category_map(project_id, category_id)
-- untuk relasi many-to-many project <-> project_categories.
--
-- Kolom legacy projects.category (text) + category_id (FK tunggal)
-- DI-PERTAHANKAN: category_id = kategori primer (fallback tampilan +
-- kompatibilitas kode lama). BACKFILL menyalin FK tunggal lama ke map.
--
-- Idempotent: aman dijalankan ulang via SQL Editor.
-- ============================================================

-- ============================================================
-- 1) TABEL JUNCTION
-- ============================================================
create table if not exists public.project_category_map (
  project_id  uuid not null references public.projects(id) on delete cascade,
  category_id uuid not null references public.project_categories(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (project_id, category_id)
);

drop index if exists project_category_map_category_id_idx;
create index project_category_map_category_id_idx on public.project_category_map (category_id);

-- ============================================================
-- 2) BACKFILL dari FK tunggal lama (project tanpa mapping tetap valid
--    via category_id / kolom legacy — filter menyembunyikan count 0)
-- ============================================================
insert into public.project_category_map (project_id, category_id)
select id, category_id from public.projects where category_id is not null
on conflict (project_id, category_id) do nothing;

-- ============================================================
-- 3) RLS — deny by default, lalu policy eksplisit (pola project_categories)
-- ============================================================
alter table public.project_category_map enable row level security;

drop policy if exists "project_category_map_public_read" on public.project_category_map;
create policy "project_category_map_public_read" on public.project_category_map
  for select using (true);

drop policy if exists "project_category_map_insert_mfa_admin_editor" on public.project_category_map;
create policy "project_category_map_insert_mfa_admin_editor" on public.project_category_map
  for insert to authenticated
  with check (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

drop policy if exists "project_category_map_update_mfa_admin_editor" on public.project_category_map;
create policy "project_category_map_update_mfa_admin_editor" on public.project_category_map
  for update to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

drop policy if exists "project_category_map_delete_mfa_admin" on public.project_category_map;
create policy "project_category_map_delete_mfa_admin" on public.project_category_map
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
grant select on public.project_category_map to anon, authenticated;
grant insert, update, delete on public.project_category_map to authenticated;

-- NOTA: hapus project -> mapping ikut terhapus (ON DELETE CASCADE),
-- API tidak perlu sinkronisasi manual saat DELETE.
