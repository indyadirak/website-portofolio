-- ============================================================
-- Schema website-portofolio (Cyber Security Portfolio)
-- Jalankan di Supabase SQL Editor.
-- ============================================================

-- ------------------------------------------------------------------
-- Tabel: projects
-- ------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  summary     text not null,
  description text not null default '',
  category    text not null default 'Web App'
              check (category in ('Web App','Mobile','Network','IoT','Red Team','Blue Team','OSINT','Forensics')),
  tags        text[] not null default '{}',
  image_url   text,
  repo_url    text,
  live_url    text,
  featured    boolean not null default false,
  status      text not null default 'active'
              check (status in ('active','archived','planned')),
  -- Struktur "Problem / Approach / Impact" untuk halaman detail project.
  problem     text,
  solution    text,
  impact      text,
  created_at  timestamptz not null default now()
);

alter table public.projects enable row level security;

drop policy if exists "projects_public_read" on public.projects;

create policy "projects_public_read" on public.projects
  for select using (true);

-- Write: MFA (aal2) + role admin/editor (delete: admin saja).
-- Pola sama persis dengan certificates di rbac-mfa.sql.
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

grant select on public.projects to anon, authenticated;
grant insert, update, delete on public.projects to authenticated;

-- ------------------------------------------------------------------
-- Tabel: skills
-- ------------------------------------------------------------------
create table if not exists public.skills (
  id       uuid primary key default gen_random_uuid(),
  name     text not null unique,
  category text not null default 'Tools'
           check (category in ('Offensive','Defensive','Tools','Programming','Soft Skill','Network','Forensics')),
  level    text not null default 'intermediate'
           check (level in ('beginner','intermediate','advanced','expert')),
  icon     text
);

alter table public.skills enable row level security;

drop policy if exists "skills_public_read" on public.skills;

create policy "skills_public_read" on public.skills
  for select using (true);

-- ------------------------------------------------------------------
-- Tabel: contact_messages
-- Public hanya boleh INSERT (bukan SELECT) — data hanya terbaca oleh
-- user terautentikasi (admin/editor/viewer) via dashboard.
-- ------------------------------------------------------------------
create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  message    text not null,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;

drop policy if exists "contact_messages_public_insert" on public.contact_messages;

create policy "contact_messages_public_insert" on public.contact_messages
  for insert to anon, authenticated
  with check (true);

-- Dibaca oleh semua role login (dashboard admin): viewer, editor, admin.
drop policy if exists "contact_messages_auth_select" on public.contact_messages;

create policy "contact_messages_auth_select" on public.contact_messages
  for select to authenticated
  using (true);

-- Tulis (tandai dibaca) & hapus: HANYA aal2 + role admin/editor.
-- Role via subquery public.profiles — JANGAN auth.jwt() ->> 'role'
-- (klaim role tidak ada di JWT project ini).
drop policy if exists "contact_messages_auth_update" on public.contact_messages;
create policy "contact_messages_auth_update" on public.contact_messages
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

drop policy if exists "contact_messages_auth_delete" on public.contact_messages;
create policy "contact_messages_auth_delete" on public.contact_messages
  for delete to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

grant update, delete on public.contact_messages to authenticated;
