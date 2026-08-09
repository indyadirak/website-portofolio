-- ============================================================
-- Konfigurasi Google Drive Backup (prinsip 3-2-1) — tabel + RLS
-- Jalankan di Supabase SQL Editor (sekali eksekusi, idempotent).
-- ============================================================
--
-- Isi: JSON key Service Account Google (DIPERKECIL: sudah dienkripsi
-- AES-256-GCM oleh Worker sebelum disimpan) + folder ID Drive tujuan.
-- Single row (id = 1) — konfigurasi GLOBAL satu baris.
--
-- Akses:
--   - WRITE: HANYA user terautentikasi dengan MFA (aal2) + role 'admin'
--     (lewat GUI admin /api/admin/backup-config).
--   - READ: HANYA aal2 + admin (GUI menampilkan status).
--   - WORKFLOW: dibaca lewat /api/backup-config (Worker) memakai
--     SUPABASE_SERVICE_ROLE_KEY runtime secret + BACKUP_FETCH_TOKEN
--     (bukan lewat RLS — token + service role yang jadi gate-nya).

-- ------------------------------------------------------------------
-- 1) TABEL: public.backup_config (single row)
--    gdrive_service_account_key menyimpan format:
--      - "enc:<ivB64>:<tagB64>:<ciphertextB64>"  (produksi, AES-256-GCM)
--      - JSON mentah                                         (hanya bila
--        secret enkripsi belum di-set — dev saja, TIDAK disarankan)
-- ------------------------------------------------------------------
create table if not exists public.backup_config (
  id                            integer primary key
                                check (id = 1), -- kunci single-row
  gdrive_service_account_key    text,
  gdrive_folder_id              text,
  updated_at                    timestamptz not null default now(),
  updated_by                    text
);

alter table public.backup_config enable row level security;

-- ------------------------------------------------------------------
-- 2) POLICIES: HANYA aal2 + role admin (paralel dengan certificates
--    write policy di rbac-mfa.sql — backup config sama sensitifnya).
-- ------------------------------------------------------------------
drop policy if exists "backup_config_select_mfa_admin" on public.backup_config;

create policy "backup_config_select_mfa_admin" on public.backup_config
  for select
  to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

drop policy if exists "backup_config_insert_mfa_admin" on public.backup_config;

create policy "backup_config_insert_mfa_admin" on public.backup_config
  for insert
  to authenticated
  with check (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

drop policy if exists "backup_config_update_mfa_admin" on public.backup_config;

create policy "backup_config_update_mfa_admin" on public.backup_config
  for update
  to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

drop policy if exists "backup_config_delete_mfa_admin" on public.backup_config;

create policy "backup_config_delete_mfa_admin" on public.backup_config
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
-- 3) GRANT minimal: anon TIDAK dapat apa pun. authenticated
--    hanya diberi akses DML — keputusan tetap di policy RLS di atas.
-- ------------------------------------------------------------------
grant select, insert, update, delete on public.backup_config to authenticated;
