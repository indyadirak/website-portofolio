-- ============================================================================
-- 99-existing-database-sync.sql
-- One-shot sync untuk database Supabase EXISTING.
--
-- Jalankan SATU KALI di Supabase SQL Editor setelah backup database.
-- Script ini idempotent: aman dijalankan ulang dan tidak menghapus data.
--
-- Yang disinkronkan:
--   1. projects.methodology, attack_path, detection
--   2. contact_messages.is_read
--   3. RLS policy + GRANT contact_messages untuk CRUD admin/editor
--   4. Reload schema cache PostgREST
--
-- Prasyarat:
--   - public.projects, public.contact_messages, dan public.profiles sudah ada
--   - public.profiles.id mengarah ke auth.users.id
--   - policy public contact_messages insert/select sudah ada atau akan dibuat
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Project Security Case Study
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists methodology text,
  add column if not exists attack_path text,
  add column if not exists detection text;

-- ---------------------------------------------------------------------------
-- 2. Contact message read state
-- ---------------------------------------------------------------------------
alter table public.contact_messages
  add column if not exists is_read boolean not null default false;

-- Existing rows are explicitly normalized for databases where the column was
-- added by an earlier partial migration with nullable values.
update public.contact_messages
set is_read = false
where is_read is null;

alter table public.contact_messages
  alter column is_read set default false,
  alter column is_read set not null;

-- ---------------------------------------------------------------------------
-- 3. RLS and grants for contact message management
-- ---------------------------------------------------------------------------
alter table public.contact_messages enable row level security;

-- Public form submission: validation and Turnstile are enforced by the Worker.
drop policy if exists "contact_messages_public_insert" on public.contact_messages;
create policy "contact_messages_public_insert"
  on public.contact_messages
  for insert
  to anon, authenticated
  with check (true);

-- Read access follows the current single-owner CMS model. Review this policy
-- before granting viewer accounts to external users because messages contain PII.
drop policy if exists "contact_messages_auth_select" on public.contact_messages;
create policy "contact_messages_auth_select"
  on public.contact_messages
  for select
  to authenticated
  using (true);

-- Mutations require an AAL2 session and an admin/editor profile. The role is
-- deliberately read from public.profiles, never from an untrusted JWT role claim.
drop policy if exists "contact_messages_auth_update" on public.contact_messages;
create policy "contact_messages_auth_update"
  on public.contact_messages
  for update
  to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  )
  with check (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

drop policy if exists "contact_messages_auth_delete" on public.contact_messages;
create policy "contact_messages_auth_delete"
  on public.contact_messages
  for delete
  to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

grant select on public.contact_messages to authenticated;
grant insert on public.contact_messages to anon, authenticated;
grant update, delete on public.contact_messages to authenticated;

commit;

-- PostgREST must refresh its schema cache before the new columns are visible
-- through Supabase REST queries.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Verification queries. They return rows but do not modify data.
-- ---------------------------------------------------------------------------
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'projects'
      and column_name in ('methodology', 'attack_path', 'detection'))
    or
    (table_name = 'contact_messages' and column_name = 'is_read')
  )
order by table_name, column_name;

select policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename = 'contact_messages'
order by policyname;
