-- ============================================================
-- MIGRASI: contact_messages CRUD (FASE 2, TUGAS 2.1)
-- Tambah kolom is_read + policy UPDATE/DELETE + GRANT eksplisit.
-- Idempotent: aman dijalankan ulang di SQL Editor.
--
-- ATURAN EMAS (Fase 1): cek role PAKAI subquery ke public.profiles.
-- JANGAN PERNAH `auth.jwt() ->> 'role'` — klaim role tidak ada di
-- JWT project ini (nilai NULL -> policy tidak pernah lolos -> 403).
-- Pola identik dengan certificates & site_settings.
-- ============================================================

-- 1) Kolom baru: penanda dibaca (default false = belum dibaca).
alter table public.contact_messages
  add column if not exists is_read boolean not null default false;

-- 2) RLS — UPDATE: HANYA aal2 (MFA terverifikasi) + role admin/editor.
--    Dipakai fitur "Tandai Dibaca" (menandai is_read = true).
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

-- 3) RLS — DELETE: HANYA aal2 + role admin/editor (hard delete).
--    Retensi otomatis 12 bulan tetap berjalan via data-retention.yml.
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

-- 4) GRANT eksplisit (idempotent — pola sama site-settings.sql).
grant update, delete on public.contact_messages to authenticated;

-- 5) VERIFIKASI (opsional, jalankan terakhir): harus menampilkan
--    4 policy (public_insert, auth_select, auth_update, auth_delete).
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'contact_messages'
order by policyname;
