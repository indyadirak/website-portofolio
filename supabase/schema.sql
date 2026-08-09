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
  created_at  timestamptz not null default now()
);

alter table public.projects enable row level security;

drop policy if exists "projects_public_read" on public.projects;

create policy "projects_public_read" on public.projects
  for select using (true);

-- ------------------------------------------------------------------
-- Tabel: skills
-- ------------------------------------------------------------------
create table if not exists public.skills (
  id       uuid primary key default gen_random_uuid(),
  name     text not null unique,
  category text not null default 'Tools'
           check (category in ('Offensive','Defensive','Tools','Programming','Soft Skill')),
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
