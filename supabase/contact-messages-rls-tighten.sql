-- ============================================================
-- TIGHTEN RLS: contact_messages SELECT hanya admin/editor
--
-- Latar belakang: policy lama "contact_messages_auth_select" memakai
-- `using (true)` untuk SEMUA role authenticated. Akun dengan role
-- "viewer" (read-only, tanpa MFA) jadi bisa membaca seluruh pesan
-- kontak — padahal isinya PII pengunjung (nama, email, isi pesan).
--
-- Policy ini membatasi SELECT ke role admin/editor (role dibaca dari
-- public.profiles, BUKAN klaim JWT). Update/delete sudah mensyaratkan
-- aal2 + admin/editor sejak contact-messages-crud.sql; tidak diubah.
--
-- Idempotent — aman dijalankan berulang. Jalankan di Supabase SQL
-- Editor, atau via `supabase db push` bila memakai CLI.
-- Butuh: public.profiles (00-full-migration.sql / schema.sql).
-- ============================================================

drop policy if exists "contact_messages_auth_select" on public.contact_messages;

create policy "contact_messages_auth_select"
  on public.contact_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

-- Grant tabel tetap ada (RLS yang memutuskan baris mana yang boleh dibaca).
grant select on public.contact_messages to authenticated;
