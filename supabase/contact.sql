-- ============================================================
-- MIGRASI contact_messages (untuk database yang SUDAH pernah
-- menjalankan schema.sql versi lama yang berisi kolom "subject").
--
-- Untuk instalasi baru: cukup jalankan supabase/schema.sql
-- (sudah memuat definisi tabel tanpa subject + policy baru).
-- ============================================================

-- 1) Hapus kolom subject (tidak dipakai lagi oleh form baru)
alter table public.contact_messages
  drop column if exists subject;

-- 2) Ganti policy lama agar konsisten dengan skema baru
drop policy if exists "contact_messages_public_insert" on public.contact_messages;
drop policy if exists "contact_messages_admin_select" on public.contact_messages;
drop policy if exists "contact_messages_auth_select" on public.contact_messages;

create policy "contact_messages_public_insert" on public.contact_messages
  for insert to anon, authenticated
  with check (true);

-- Dibaca HANYA oleh admin/editor (pesan berisi PII pengunjung; viewer
-- read-only tidak boleh membaca). Role dari public.profiles, bukan JWT.
create policy "contact_messages_auth_select" on public.contact_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );
