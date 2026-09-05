-- ============================================================
-- MIGRASI: writeups status (draft/published) — FASE 2, TUGAS 2.4
-- Tambah kolom `status` sebagai sumber kebenaran publish + trigger
-- sinkronisasi kolom legacy `is_published` agar seluruh policy RLS
-- (`writeups_public_read using (is_published = true)`) dan query lama
-- tetap konsisten tanpa perubahan tabel lain.
-- Idempotent: aman dijalankan ulang di SQL Editor.
-- ============================================================

-- 1) Kolom status: default 'published' (tidak ada draft baru tanpa disengaja),
--    hanya boleh 'draft' | 'published'.
alter table public.writeups
  drop constraint if exists writeups_status_check;
alter table public.writeups
  add column if not exists status text not null default 'published';
alter table public.writeups
  add constraint writeups_status_check
    check (status in ('draft', 'published'));

-- 2) Backfill dari kondisi lama: baris yang belum diterbitkan jadi draft.
update public.writeups
   set status = case when is_published then 'published' else 'draft' end;

-- 3) Trigger: status = single source of truth; is_published = turunannya.
--    Dijalankan setiap INSERT/UPDATE sehingga RLS & query berbasis
--    is_published tidak pernah melenceng dari status.
create or replace function public.sync_writeup_is_published()
returns trigger language plpgsql as $$
begin
  new.is_published := (new.status = 'published');
  return new;
end;
$$;

drop trigger if exists writeups_status_sync_is_published on public.writeups;
create trigger writeups_status_sync_is_published
  before insert or update on public.writeups
  for each row execute function public.sync_writeup_is_published();

-- 4) VERIFIKASI (opsional, jalankan terakhir):
--    select count(*) as total,
--           count(*) filter (where status = 'published') as published,
--           count(*) filter (where status = 'draft') as draft
--    from public.writeups;