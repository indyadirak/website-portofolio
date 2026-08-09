-- ============================================================
-- Public features upgrade: Project P/S/I + Skill filter + RLS write
-- Jalankan di Supabase SQL Editor (idempotent — aman dijalankan ulang).
-- Membutuhkan: supabase/schema.sql sudah pernah dijalankan.
-- ============================================================

-- ------------------------------------------------------------------
-- 1) PROJECTS: kolom problem / solution / impact (text, nullable)
--    Struktur "Problem / Approach / Impact" untuk halaman detail.
--    Nullable agar project lama tetap valid tanpa mengisi ketiganya.
-- ------------------------------------------------------------------
alter table public.projects add column if not exists problem text;
alter table public.projects add column if not exists solution text;
alter table public.projects add column if not exists impact text;

-- ------------------------------------------------------------------
-- 2) SKILLS: perluas daftar kategori untuk profil
--    Network & Cyber Security Technician (bukan kategori generic dev).
--    Tambah: Network, Forensics. Tetap idempotent.
-- ------------------------------------------------------------------
alter table public.skills drop constraint if exists skills_category_check;

alter table public.skills add constraint skills_category_check
  check (category in ('Offensive','Defensive','Tools','Programming','Soft Skill','Network','Forensics'));

-- ------------------------------------------------------------------
-- 3) RLS WRITE: public.projects
--    Pola sama persis dengan certificates (rbac-mfa.sql):
--    - INSERT/UPDATE: MFA (aal2) + role admin/editor
--    - DELETE:        MFA (aal2) + role admin
--    - SELECT publik  : sudah ada (projects_public_read) — TETAP BERLAKU.
--    - featured (boolean) sudah ada sejak awal — tidak perlu kolom baru.
-- ------------------------------------------------------------------
drop policy if exists "projects_insert_mfa_admin_editor" on public.projects;

create policy "projects_insert_mfa_admin_editor" on public.projects
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

drop policy if exists "projects_update_mfa_admin_editor" on public.projects;

create policy "projects_update_mfa_admin_editor" on public.projects
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

drop policy if exists "projects_delete_mfa_admin" on public.projects;

create policy "projects_delete_mfa_admin" on public.projects
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
-- 4) GRANT EKSPLISIT (WAJIB — tabel via SQL Editor tidak otomatis
--    punya grant; tanpa grant authenticated ditolak sebelum policy
--    RLS dievaluasi). SELECT publik sudah di-grant di schema.sql.
-- ------------------------------------------------------------------
grant insert, update, delete on public.projects to authenticated;
