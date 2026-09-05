-- ============================================================
-- 00-full-migration.sql — INSTALL LENGKAP (Sekali Jalan)
-- ============================================================
-- Gabungan SEMUA migrasi supabase/ untuk fresh install / full
-- re-sync. Dijalankan di Supabase SQL Editor dalam SATU transaksi
-- (BEGIN ... COMMIT): jika ada satu statement gagal, SEMUA otomatis
-- rollback — tidak ada perubahan setengah jalan.
--
-- A) URUTAN TELAH DIVERIFIKASI ULANG (bukan sekadar urutan nama):
--    * rbac-mfa.sql WAJIB di paling depan — file ini membuat tabel
--      public.profiles yang direferensikan subquery policy di
--      schema.sql, storage.sql, cv.sql, login-attempts.sql,
--      backup-config*.sql, public-features.sql.
--      (CREATE POLICY memvalidasi ekspresi saat dibuat; jika tabel
--      referensi belum ada -> error 42P01.)
--    * schema.sql (projects/skills/contact_messages) setelahnya.
--    * contact.sql (migrasi kolom subject lama) setelah schema.sql.
--    * storage.sql / cv.sql (bucket + policy storage.objects)
--      bergantung pada profiles.
--    * public-features.sql (kolom projects P/S/I) setelah schema.sql.
--    * certificates-*.sql (kolom baru) setelah rbac-mfa.sql
--      (tabel certificates lahir di sana).
--    File yang tidak saling bergantung (storage, login-attempts,
--    backup-config, backup-config-access-log, cv) tetap memakai
--    urutan relatif seperti di docs/DEPLOYMENT.md.
--
-- B) IDEMPOTENT: semua CREATE TABLE/COLUMN/INDEX memakai
--    IF NOT EXISTS, semua CREATE POLICY diawali DROP POLICY IF
--    EXISTS, trigger/function pakai DROP IF EXISTS / OR REPLACE,
--    bucket pakai ON CONFLICT DO NOTHING. AMAN dijalankan berkali-
--    kali, baik di database kosong maupun yang sudah ter-migrasi
--    sebagian.
--
-- C) SETELAH INI (tetap manual, bukan SQL):
--    1. Buat user admin via Supabase Dashboard (Authentication →
--       Users), lalu set role='admin' di public.profiles dan
--       mfa_enforced=true.
--    2. Set environment: TURNSTILE_SECRET_KEY, SUPABASE_URL,
--       SUPABASE_SERVICE_ROLE_KEY, BACKUP_FETCH_TOKEN,
--       GDRIVE_CONFIG_ENCRYPTION_SECRET (runtime secret Worker).
-- ============================================================

begin;

-- ============================================================
-- 1. RBAC + MFA — PROFILES & CERTIFICATES (supabase/rbac-mfa.sql)
--    Membuat public.profiles, public.certificates, RLS, grants,
--    trigger auto-profil. Wajib paling awal: tabel profiles
--    direferensikan policy di hampir semua file berikut.
-- ============================================================

-- ------------------------------------------------------------------
-- 1) TABEL: public.profiles
--    id -> auth.users(id): setiap user auth tepat punya 1 profil.
--    role: admin | editor | viewer   |   mfa_enforced: boolean
-- ------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text,
  avatar_url   text,
  role         text not null default 'viewer'
               check (role in ('admin', 'editor', 'viewer')),
  mfa_enforced boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- 2) TABEL: public.certificates
-- ------------------------------------------------------------------
create table if not exists public.certificates (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  issuer        text not null,
  issue_date    date not null,
  expiry_date   date,
  credential_id text unique,
  credential_url text,
  skills        text[] not null default '{}',
  description   text,
  file_url      text,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- 3) AKTIFKAN ROW LEVEL SECURITY (WAJIB!)
--    Tanpa ini seluruh policy di bawah TIDAK BERLAKU.
-- ------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.certificates enable row level security;

-- ------------------------------------------------------------------
-- 4) POLICIES: public.certificates
-- ------------------------------------------------------------------

-- 4a. SELECT publik tanpa syarat (anon + authenticated).
drop policy if exists "certificates_public_read" on public.certificates;

create policy "certificates_public_read" on public.certificates
  for select
  to anon, authenticated
  using (true);

-- 4b. INSERT: HANYA user dengan MFA terverifikasi (aal2) DAN role admin/editor.
drop policy if exists "certificates_insert_mfa_admin_editor" on public.certificates;

create policy "certificates_insert_mfa_admin_editor" on public.certificates
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

-- 4c. UPDATE: policy terpisah — klausa USING DAN WITH CHECK
--     KEDUANYA mensyaratkan aal2 + role admin/editor.
drop policy if exists "certificates_update_mfa_admin_editor" on public.certificates;

create policy "certificates_update_mfa_admin_editor" on public.certificates
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

-- 4d. DELETE: HANYA MFA terverifikasi (aal2) DAN role admin.
drop policy if exists "certificates_delete_mfa_admin" on public.certificates;

create policy "certificates_delete_mfa_admin" on public.certificates
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

-- Catatan viewer: tidak ada policy khusus — viewer TIDAK dapat INSERT/UPDATE/DELETE
-- (tidak ada policy yang mengizinkan), hanya bisa SELECT via policy 4a.
-- Viewer tidak butuh MFA karena tidak pernah menyentuh operasi mutasi.

-- ------------------------------------------------------------------
-- 5) POLICIES: public.profiles
--    WAJIB: setiap user boleh membaca baris profilnya sendiri.
--    Tanpa policy ini, semua subquery cek role di atas selalu kosong
--    (RLS memblokir pembacaan profiles) sehingga admin/editor akan
--    ditolak melakukan mutasi apa pun meski MFA & kredensial benar.
-- ------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- PERINGATAN KEAMANAN:
-- JANGAN membuat policy UPDATE/INSERT pada profiles untuk self-service.
-- Policy seperti "profiles_update_own" (user mengedit barisnya sendiri)
-- akan memungkinkan privilege escalation (viewer mengubah role-nya jadi admin).
-- Perubahan role / mfa_enforced hanya via Supabase Dashboard (lihat bawah).

-- ------------------------------------------------------------------
-- 5.5) GRANT EKSPLISIT (WAJIB!)
--      Tabel yang dibuat via SQL Editor TIDAK otomatis memiliki GRANT.
--      Tanpa grant, anon/authenticated ditolak di level tabel SEBELUM
--      policy RLS sempat dievaluasi. Grant di sini sengaja minimal:
--      - anon:          hanya SELECT certificates (kartu publik).
--      - authenticated: SELECT certificates + SELECT profil sendiri.
--      Mutasi (INSERT/UPDATE/DELETE) tetap diputuskan policy RLS aal2.
--      profiles sengaja TIDAK di-grant ke anon (data private).
-- ------------------------------------------------------------------
grant select on public.certificates to anon, authenticated;
grant select on public.profiles to authenticated;
grant insert, update, delete on public.certificates to authenticated;

-- ------------------------------------------------------------------
-- 6) TRIGGER: auto-create profil saat user auth baru terdaftar.
--    AFTER INSERT pada auth.users -> buat baris public.profiles
--    dengan role default 'viewer' dan mfa_enforced default false.
--    Mencegah user auth tanpa profil (semua cek role RLS akan gagal).
-- ------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, mfa_enforced)
  values (new.id, 'viewer', false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Catatan: `security definer` + `set search_path = public` diperlukan agar
-- fungsi bisa INSERT ke profiles (yang terlindung RLS) dan aman dari
-- search-path hijacking. `on conflict do nothing` membuat script idempotent.

-- ============================================================
-- 2. SCHEMA DASAR — PROJECTS, SKILLS, CONTACT_MESSAGES
--    (supabase/schema.sql)
--    SETELAH rbac-mfa.sql: policy write projects di bawah ini
--    mereferensikan public.profiles (tabel dari rbac-mfa.sql).
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

-- ============================================================
-- 3. MIGRASI KONTAK — KOLOM SUBJECT LAMA (supabase/contact.sql)
--    Hanya relevan untuk DB yang pernah menjalankan schema.sql
--    versi lama (kolom "subject"). Di fresh install ini no-op
--    (drop column if exists). Butuh contact_messages (schema.sql).
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

-- Dibaca oleh semua role login (dashboard admin): viewer, editor, admin.
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

-- ============================================================
-- 4. STORAGE SERTIFIKAT — BUCKET + POLICY storage.objects
--    (supabase/storage.sql)
--    Policy insert/delete mereferensikan public.profiles
--    (rbac-mfa.sql), jadi harus setelahnya.
-- ============================================================

-- ------------------------------------------------------------------
-- 1) BUCKET privat: certificates
--    Bucket privat -> file TIDAK bisa diakses publik langsung;
--    akses melalui signed URL yang dibuat oleh user terautentikasi.
-- ------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('certificates', 'certificates', false)
on conflict (id) do nothing;

-- ------------------------------------------------------------------
-- 2) RLS pada storage.objects
--    Sudah aktif SECARA DEFAULT di semua project Supabase (storage
--    dikelola platform, bukan postgres), jadi TIDAK perlu (dan tidak
--    bisa) menjalankan: alter table storage.objects enable row level security;
-- ------------------------------------------------------------------

-- ------------------------------------------------------------------
-- 3) POLICIES storage.objects
--    Model keamanan disamakan dengan tabel certificates:
--    - Read: user terautentikasi (untuk membuat signed URL).
--    - Write (insert): MFA terverifikasi (aal2) + role admin/editor
--      (mirror dari policy insert certificates).
--    - Update: pemilik file (bucket privat per-user path).
--    - Delete: MFA terverifikasi (aal2) + role admin.
-- ------------------------------------------------------------------

-- Read: hanya user login (viewer boleh baca sertifikat, jadi berhak
-- membuat signed URL untuk melihat file).
drop policy if exists "certificates_files_select_auth" on storage.objects;

create policy "certificates_files_select_auth" on storage.objects
  for select to authenticated
  using (bucket_id = 'certificates');

-- Insert: aal2 + role admin/editor — sama ketatnya dengan insert row.
drop policy if exists "certificates_files_insert_mfa_admin_editor" on storage.objects;

create policy "certificates_files_insert_mfa_admin_editor" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'certificates'
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

-- Update: hanya pemilik file.
drop policy if exists "certificates_files_update_owner" on storage.objects;

create policy "certificates_files_update_owner" on storage.objects
  for update to authenticated
  using (bucket_id = 'certificates' and owner = auth.uid())
  with check (bucket_id = 'certificates' and owner = auth.uid());

-- Delete: MFA (aal2) + role admin — file hanya dihapus saat admin
-- menghapus sertifikat (rollback juga dilakukan via policy ini).
drop policy if exists "certificates_files_delete_mfa_admin" on storage.objects;

create policy "certificates_files_delete_mfa_admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'certificates'
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- ============================================================
-- 5. LOGIN ATTEMPTS — AUDIT (supabase/login-attempts.sql)
--    Policy SELECT admin mereferensikan public.profiles
--    (rbac-mfa.sql), jadi harus setelahnya.
-- ============================================================

-- ===================== 1. TABEL =====================
create table if not exists public.login_attempts (
  id             uuid primary key default gen_random_uuid(),
  email          text,
  ip_address     text,
  user_agent     text,
  -- 'blocked' = ditolak rate limiter/lockout/KV-unavailable (email NULL,
  -- kredensial TIDAK disimpan untuk baris ini — privacy).
  status         text not null check (status in ('success', 'failed', 'blocked')),
  -- Alasan penolakan untuk status 'blocked': 'lockout' | 'kv_unavailable'.
  blocked_reason text check (blocked_reason in ('lockout', 'kv_unavailable')),
  attempted_at   timestamptz not null default now()
);

create index if not exists login_attempts_attempted_at_idx
  on public.login_attempts (attempted_at desc);

-- ===================== 2. RLS =====================
alter table public.login_attempts enable row level security;

-- SELECT hanya admin (cek profil role admin, pola sama dengan rbac-mfa.sql)
drop policy if exists "login_attempts_admin_select" on public.login_attempts;

create policy "login_attempts_admin_select"
  on public.login_attempts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Tidak ada policy insert untuk anon/authenticated:
-- penulisan HANYA lewat fungsi SECURITY DEFINER di bawah.
revoke all on public.login_attempts from anon, authenticated;
grant select on public.login_attempts to authenticated;

-- ===================== 3. FUNGSI PENCATAT =====================
-- anon bisa memanggil fungsi ini (melalui supabase.rpc) untuk MENULIS,
-- tapi tidak bisa membaca/menghapus — parameter dibatasi, jadi tidak ada
-- kebocoran data. Signature baru (5 param) menggantikan versi 4 param.
drop function if exists public.record_login_attempt(text, text, text, text);

create or replace function public.record_login_attempt(
  p_email           text,
  p_ip              text,
  p_user_agent      text,
  p_status          text,
  p_blocked_reason  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.login_attempts (email, ip_address, user_agent, status, blocked_reason)
  values (p_email, p_ip, p_user_agent, p_status, p_blocked_reason);

  -- Cleanup otomatis: hapus baris lebih dari 90 hari (murah, 1x per login).
  delete from public.login_attempts
  where attempted_at < now() - interval '90 days';
end;
$$;

revoke all on function public.record_login_attempt(text, text, text, text, text)
  from public;
grant execute on function public.record_login_attempt(text, text, text, text, text)
  to anon, authenticated;

-- ============================================================
-- 6. BACKUP CONFIG — KONFIGURASI GOOGLE DRIVE
--    (supabase/backup-config.sql)
--    Semua policy mereferensikan public.profiles (rbac-mfa.sql).
-- ============================================================

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

-- ============================================================
-- 7. BACKUP CONFIG ACCESS LOG — AUDIT ENDPOINT
--    (supabase/backup-config-access-log.sql)
--    Policy SELECT admin mereferensikan public.profiles
--    (rbac-mfa.sql), jadi harus setelahnya.
-- ============================================================

-- ===================== 1. TABEL =====================
create table if not exists public.backup_config_access_log (
  id             uuid primary key default gen_random_uuid(),
  ip_address     text,
  user_agent     text,
  -- 'success' = token benar (konfigurasi disajikan); 'failed' = token salah;
  -- 'blocked'  = ditolak rate limiter / KV unavailable.
  status         text not null check (status in ('success', 'failed', 'blocked')),
  -- Alasan penolakan untuk status 'blocked':
  --   'rate_limited'   = batas percobaan gagal per-IP tercapai
  --   'kv_unavailable' = fail-closed (KV tidak tersedia)
  blocked_reason text check (blocked_reason in ('rate_limited', 'kv_unavailable')),
  attempted_at   timestamptz not null default now()
);

create index if not exists backup_config_access_log_attempted_at_idx
  on public.backup_config_access_log (attempted_at desc);

-- ===================== 2. RLS =====================
alter table public.backup_config_access_log enable row level security;

-- SELECT hanya admin (pola sama dengan login_attempts_admin_select).
drop policy if exists "backup_config_access_log_admin_select" on public.backup_config_access_log;

create policy "backup_config_access_log_admin_select"
  on public.backup_config_access_log
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Tidak ada policy insert/update/delete untuk anon/authenticated:
-- penulisan HANYA lewat service_role dari Worker endpoint.
revoke all on public.backup_config_access_log from anon, authenticated;
grant select on public.backup_config_access_log to authenticated;

-- ============================================================
-- 8. CV/RESUME — BUCKET PUBLIK + cv_files (supabase/cv.sql)
--    Policy admin mereferensikan public.profiles (rbac-mfa.sql),
--    cv_files.uploaded_by mereferensikan auth.users.
-- ============================================================

-- ------------------------------------------------------------------
-- 1) BUCKET PUBLIK: cv
--    CV adalah dokumen yang memang untuk publik (diunduh tanpa login),
--    jadi bucket sengaja PUBLIC. Yang dibatasi justru TULIS-nya:
--    insert/update/delete hanya MFA (aal2) + role admin.
-- ------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('cv', 'cv', true)
on conflict (id) do nothing;

-- RLS pada storage.objects sudah aktif default di Supabase (dikelola
-- platform, bukan postgres) — tidak perlu alter table di sini.

-- Insert: MFA (aal2) + role admin.
drop policy if exists "cv_files_insert_mfa_admin" on storage.objects;

create policy "cv_files_insert_mfa_admin" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cv'
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Update: MFA (aal2) + role admin (untuk mengganti file CV yang sama).
drop policy if exists "cv_files_update_mfa_admin" on storage.objects;

create policy "cv_files_update_mfa_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'cv')
  with check (
    bucket_id = 'cv'
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Delete: MFA (aal2) + role admin.
drop policy if exists "cv_files_delete_mfa_admin" on storage.objects;

create policy "cv_files_delete_mfa_admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cv'
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- ------------------------------------------------------------------
-- 2) TABEL: public.cv_files (metadata file CV per bahasa)
--    locale -> 'id' | 'en' (satu file aktif per bahasa).
--    Path di storage SELALU 'cv-<locale>.pdf' (stabil untuk URL publik);
--    nama asli & ukuran disimpan di sini untuk ditampilkan di admin GUI.
-- ------------------------------------------------------------------
create table if not exists public.cv_files (
  locale      text primary key check (locale in ('id', 'en')),
  file_path   text not null,
  file_name   text not null,
  size_bytes  bigint not null,
  mime        text not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.cv_files enable row level security;

-- Select: siapa saja boleh baca metadata (path/versi sudah publik).
drop policy if exists "cv_files_select_public" on public.cv_files;

create policy "cv_files_select_public" on public.cv_files
  for select using (true);

-- Insert/Update/Delete: MFA (aal2) + role admin.
drop policy if exists "cv_files_write_mfa_admin" on public.cv_files;

create policy "cv_files_write_mfa_admin" on public.cv_files
  for all to authenticated
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

-- ------------------------------------------------------------------
-- 3) GRANT EKSPLISIT (WAJIB — tabel via SQL Editor tidak otomatis
--    punya grant; tanpa grant anon/authenticated ditolak sebelum
--    policy RLS dievaluasi).
-- ------------------------------------------------------------------
grant select on public.cv_files to anon, authenticated;
grant insert, update, delete on public.cv_files to authenticated;

-- ============================================================
-- 9. PUBLIC FEATURES — PROJECT P/S/I + SKILL FILTER + RLS WRITE
--    (supabase/public-features.sql)
--    Butuh tabel projects (schema.sql) & profiles (rbac-mfa.sql).
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

-- ============================================================
-- 10. SERTIFIKAT: KATEGORI (supabase/certificates-category.sql)
--     Butuh tabel certificates (rbac-mfa.sql).
-- ============================================================

-- ------------------------------------------------------------------
-- 1) CERTIFICATES: kolom category (text, wajib, default 'training')
--    - 'compliance' : sertifikat kepatuhan standar (ISO, GDPR, dll)
--    - 'training'   : sertifikat pelatihan teknis / kursus / workshop
--    Default 'training' -> seluruh sertifikat lama otomatis masuk
--    kategori training (tidak ada data yang menjadi NULL).
--    Teknik idempotent (pola public-features.sql):
--    tambah kolom jika belum ada, lalu drop & recreate constraint check
--    agar definisi CHECK selalu sinkron bila migrasi dijalankan ulang.
-- ------------------------------------------------------------------
alter table public.certificates add column if not exists category text not null default 'training';

alter table public.certificates drop constraint if exists certificates_category_check;

alter table public.certificates add constraint certificates_category_check
  check (category in ('compliance', 'training'));

-- ------------------------------------------------------------------
-- 2) GRANT: tidak perlu kolom/bijak baru — kolom category otomatis
--    ter-cover oleh policy RLS SELECT publik (certificates_public_read)
--    dan policy tulis (insert/update mfa_admin_editor) yang SUDAH ADA.
--    SELECT certs sudah di-grant ke anon, authenticated di rbac-mfa.sql.
--    Tidak ada grant tambahan yang wajib di sini.
-- ------------------------------------------------------------------

-- ============================================================
-- 11. SERTIFIKAT: URL VERIFIKASI (supabase/certificates-verification-url.sql)
--     Butuh tabel certificates (rbac-mfa.sql).
-- ============================================================

-- ------------------------------------------------------------------
-- 1) CERTIFICATES: kolom verification_url (text, nullable)
--    URL halaman verifikasi RESMI dari issuer (misal link verifikasi
--    badge Credly / lembaga penerbit). NULL = tidak punya halaman
--    verifikasi online — UI publik tidak menampilkan link apapun.
--    Teknik idempotent (pola certificates-category.sql): tambah kolom
--    hanya jika belum ada.
-- ------------------------------------------------------------------
alter table public.certificates add column if not exists verification_url text;

-- ------------------------------------------------------------------
-- 2) GRANT/RLS: TIDAK perlu diubah — kolom baru otomatis ter-cover
--    policy RLS yang SUDAH ADA (SELECT publik certificates_public_read,
--    tulis insert/update mfa_admin_editor) karena policy bekerja di
--    level row, bukan level kolom, dan tidak ada column-level GRANT
--    yang membatasi akses ke tabel certificates. Data lama:
--    verification_url = NULL (tidak ada link yang muncul).
-- ------------------------------------------------------------------

-- ============================================================
-- 12. SERTIFIKAT: TANGGAL TERBIT (supabase/certificates-issue-date.sql)
--     Butuh tabel certificates (rbac-mfa.sql).
-- ============================================================

-- ------------------------------------------------------------------
-- 1) CERTIFICATES: kolom issue_date (date, WAJIB, default = hari ini)
--    Kolom ini sudah ada sejak rbac-mfa.sql (`issue_date date not null`)
--    dan dipakai end-to-end (API, form admin, grid publik). Upgrade ini
--    hanya menambahkan DEFAULT CURRENT_DATE + memastikan NOT NULL,
--    sehingga INSERT tanpa tanggal terbit otomatis memakai hari ini.
--    Strategi data lama: seluruh row existing sudah NOT NULL (tidak ada
--    NULL yang perlu dibackfill); sekalipun ada NULL (skema lama),
--    backfill memakai created_at::date, bukan CURRENT_DATE, agar tanggal
--    terbit mendekati fakta — bukan tanggal migrasi dijalankan.
-- ------------------------------------------------------------------
alter table public.certificates add column if not exists issue_date date;

update public.certificates
   set issue_date = coalesce(created_at::date, current_date)
 where issue_date is null;

alter table public.certificates alter column issue_date set default current_date;
alter table public.certificates alter column issue_date set not null;

-- ------------------------------------------------------------------
-- 2) GRANT/RLS: TIDAK perlu diubah — kolom baru otomatis ter-cover
--    policy RLS yang SUDAH ADA (SELECT publik certificates_public_read,
--    tulis insert/update mfa_admin_editor) karena policy bekerja di
--    level row, bukan level kolom, dan tidak ada column-level GRANT.
-- ------------------------------------------------------------------

-- ============================================================
-- 13. SERTIFIKAT: TANGGAL KEDALUWARSA (supabase/certificates-expiry-date.sql)
--     Butuh tabel certificates (rbac-mfa.sql).
-- ============================================================

-- ------------------------------------------------------------------
-- 1) CERTIFICATES: kolom expiry_date (date, NULLABLE — wajib boleh
--    kosong; banyak sertifikat tidak punya masa berlaku).
--    Kolom ini sudah ada sejak rbac-mfa.sql; upgrade ini memastikan
--    kolom eksis + selalu nullable (tanpa default) agar definisi
--    konsisten walau skema dasar berubah di masa depan.
--    Data lama: expiry_date = NULL -> UI tidak menampilkan badge
--    status masa berlaku apa pun (per desain, bukan bug).
-- ------------------------------------------------------------------
alter table public.certificates add column if not exists expiry_date date;

alter table public.certificates alter column expiry_date drop not null;

-- ------------------------------------------------------------------
-- 2) GRANT/RLS: TIDAK perlu diubah — kolom baru otomatis ter-cover
--    policy RLS yang SUDAH ADA (SELECT publik certificates_public_read,
--    tulis insert/update mfa_admin_editor) karena policy bekerja di
--    level row, bukan level kolom, dan tidak ada column-level GRANT.
-- ------------------------------------------------------------------

-- ============================================================
-- 14. SERTIFIKAT: FEATURED (supabase/certificates-featured.sql)
--     Butuh tabel certificates (rbac-mfa.sql).
-- ============================================================

-- ------------------------------------------------------------------
-- 1) CERTIFICATES: kolom is_featured (boolean, wajib, default false)
--    Replikasi pola `featured` di tabel projects (schema.sql): boolean
--    NOT NULL DEFAULT false — data lama otomatis non-featured, tidak
--    ada nilai yang menjadi NULL.
--    Dipakai UI publik untuk badge "Featured" + urutan paling atas.
-- ------------------------------------------------------------------
alter table public.certificates add column if not exists is_featured boolean not null default false;

-- ------------------------------------------------------------------
-- 2) GRANT/RLS: TIDAK perlu diubah — kolom baru otomatis ter-cover
--    policy RLS yang SUDAH ADA (SELECT publik certificates_public_read,
--    tulis insert/update mfa_admin_editor) karena policy bekerja di
--    level row, bukan level kolom, dan tidak ada column-level GRANT.
-- ------------------------------------------------------------------

-- ============================================================
-- 15. SERTIFIKAT: KETERANGAN SINGKAT PER BAHASA
--     (supabase/certificates-short-description.sql)
--     Butuh tabel certificates (rbac-mfa.sql).
-- ============================================================

-- ------------------------------------------------------------------
-- 1) CERTIFICATES: dua kolom terpisah per bahasa (nullable)
--    - short_description_id : keterangan singkat bahasa Indonesia
--    - short_description_en : keterangan singkat bahasa Inggris
--    Pola konten locale-aware SAMA dengan Problem/Solution/Impact di
--    tabel projects (public-features.sql) — dua kolom, bukan satu
--    kolom dengan translasi digabung. NULL = tidak ditampilkan.
--    Batas 150 karakter diberlakukan di form admin + validasi API
--    (server-side), bukan constraint DB — konsisten dengan pola
--    panjang-penuh di kolom description.
-- ------------------------------------------------------------------
alter table public.certificates add column if not exists short_description_id text;
alter table public.certificates add column if not exists short_description_en text;

-- ------------------------------------------------------------------
-- 2) GRANT/RLS: TIDAK perlu diubah — kolom baru otomatis ter-cover
--    policy RLS yang SUDAH ADA (SELECT publik certificates_public_read,
--    tulis insert/update mfa_admin_editor) karena policy bekerja di
--    level row, bukan level kolom, dan tidak ada column-level GRANT.
-- ------------------------------------------------------------------

-- ============================================================
-- 16. WRITEUPS: CMS laporan CTF (TryHackMe / HackTheBox)
--     (supabase/writeups.sql)
--     Butuh tabel profiles (rbac-mfa.sql) untuk subquery role.
-- ============================================================

create table if not exists public.writeups (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  slug         text not null unique,
  target_env   text not null,
  methodology  text not null,
  severity     text not null
               check (severity in ('Critical', 'High', 'Med', 'Low')),
  findings     text not null,
  remediation  text not null,
  is_published boolean not null default false,
  status       text not null default 'published'
               check (status in ('draft', 'published')),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.writeups enable row level security;

alter table public.writeups
  drop constraint if exists writeups_status_check;
alter table public.writeups
  add column if not exists status text not null default 'published';
alter table public.writeups
  add constraint writeups_status_check
    check (status in ('draft', 'published'));
update public.writeups
   set status = case when is_published then 'published' else 'draft' end;

drop policy if exists "writeups_public_read" on public.writeups;

create policy "writeups_public_read" on public.writeups
  for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists "writeups_auth_manage_read" on public.writeups;

create policy "writeups_auth_manage_read" on public.writeups
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

drop policy if exists "writeups_insert_mfa_admin_editor" on public.writeups;

create policy "writeups_insert_mfa_admin_editor" on public.writeups
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

drop policy if exists "writeups_update_mfa_admin_editor" on public.writeups;

create policy "writeups_update_mfa_admin_editor" on public.writeups
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

drop policy if exists "writeups_delete_mfa_admin" on public.writeups;

create policy "writeups_delete_mfa_admin" on public.writeups
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

grant select on public.writeups to anon, authenticated;
grant insert, update, delete on public.writeups to authenticated;

-- Trigger: status = sumber kebenaran publish; is_published = turunannya
-- (keep sinkron agar policy RLS & query berbasis is_published tetap akurat).
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

-- Migration: project-categories
-- ============================================================
-- B2: Dynamic Project Categories
--
-- 1) Tabel project_categories (sumber kebenaran kategori proyek).
-- 2) Seed 14 kategori awal (existing 8 + 6 baru) — idempotent.
-- 3) projects.category_id FK nullable (ON DELETE SET NULL) —
--    kolom category text DI-PERTAHANKAN sebagai fallback legacy.
-- 4) DROP CHECK constraint category (fix bug "Defensive" — TS
--    mengizinkan, DB menolak).
-- 5) RLS + GRANT (pola tabel lain).
-- 6) Trigger updated_at (pola tabel lain di 00-full-migration.sql).
--
-- Idempotent: aman dijalankan ulang via SQL Editor.

-- ============================================================
-- 1) TABEL PROJECT_CATEGORIES
-- ============================================================
create table if not exists public.project_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null,
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Unique di name & slug (tanpa ini, ON CONFLICT di bawah tidak berfungsi).
alter table public.project_categories
  drop constraint if exists project_categories_name_key;
alter table public.project_categories
  add constraint project_categories_name_key unique (name);

alter table public.project_categories
  drop constraint if exists project_categories_slug_key;
alter table public.project_categories
  add constraint project_categories_slug_key unique (slug);

-- ============================================================
-- 2) SEED 14 KATEGORI AWAL (idempotent)
-- ============================================================
insert into public.project_categories (name, slug, description, sort_order, is_active) values
  ('Web App',              'web-app',              'Aplikasi berbasis web.',                10, true),
  ('Mobile',               'mobile',               'Aplikasi mobile.',                      20, true),
  ('Network',              'network',              'Infrastruktur jaringan.',               30, true),
  ('IoT',                  'iot',                  'Internet of Things.',                   40, true),
  ('Red Team',             'red-team',             'Simulasi serangan ofensif.',            50, true),
  ('Blue Team',            'blue-team',            'Pertahanan dan monitoring.',            60, true),
  ('Defensive',            'defensive',            'Kontrol pertahanan keamanan.',          70, true),
  ('OSINT',                'osint',                'Open-source intelligence.',             80, true),
  ('Forensics',            'forensics',            'Digital forensics & incident response.', 90, true),
  ('Cloud Security',       'cloud-security',       'Keamanan lingkungan cloud.',            100, true),
  ('Malware Analysis',     'malware-analysis',     'Analisis statis & dinamis malware.',     110, true),
  ('Active Directory',     'active-directory',     'Audit & hardening Active Directory.',    120, true),
  ('Security Automation',  'security-automation',  'Otomatisasi operasi keamanan.',          130, true),
  ('Incident Response',    'incident-response',    'Respon & pemulihan insiden.',           140, true)
on conflict (name) do nothing;

-- ============================================================
-- 3) MODIFIKASI TABEL PROJECTS
-- ============================================================
-- Kolom FK baru (nullable — proyek lama tanpa kategori_id tetap valid,
-- baca fallback ke kolom category text).
alter table public.projects
  drop column if exists category_id;
alter table public.projects
  add column category_id uuid references public.project_categories(id) on delete set null;

-- Index untuk JOIN (performa filter kategori).
drop index if exists projects_category_id_idx;
create index projects_category_id_idx on public.projects (category_id);

-- DROP CHECK constraint category — kategori kini DINAMIS dari tabel
-- project_categories. Fix bug "Defensive": kode TS mengizinkan nilai
-- ini tapi DB menolak (insert gagal 403). Setelah constraint dihapus,
-- kategori anyar bebas, dan RLS/API memvalidasi via FK.
alter table public.projects
  drop constraint if exists projects_category_check;

-- ============================================================
-- 4) TRIGGER UPDATED_AT (pola tabel lain di 00-full-migration.sql)
-- ============================================================
create or replace function public.set_updated_at_project_categories()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_categories_set_updated_at on public.project_categories;
create trigger project_categories_set_updated_at
  before update on public.project_categories
  for each row execute function public.set_updated_at_project_categories();

-- ============================================================
-- 5) RLS — deny by default, lalu policy eksplisit
-- ============================================================
alter table public.project_categories enable row level security;

drop policy if exists "project_categories_public_read" on public.project_categories;
create policy "project_categories_public_read" on public.project_categories
  for select using (is_active = true);

-- Admin/editor: baca SEMUA (termasuk non-aktif) + kelola.
drop policy if exists "project_categories_auth_manage_read" on public.project_categories;
create policy "project_categories_auth_manage_read" on public.project_categories
  for select to authenticated
  using (true);

drop policy if exists "project_categories_insert_mfa_admin_editor" on public.project_categories;
create policy "project_categories_insert_mfa_admin_editor" on public.project_categories
  for insert to authenticated
  with check (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

drop policy if exists "project_categories_update_mfa_admin_editor" on public.project_categories;
create policy "project_categories_update_mfa_admin_editor" on public.project_categories
  for update to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

drop policy if exists "project_categories_delete_mfa_admin" on public.project_categories;
create policy "project_categories_delete_mfa_admin" on public.project_categories
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
-- 6) GRANT
-- ============================================================
grant select on public.project_categories to anon, authenticated;
grant insert, update, delete on public.project_categories to authenticated;

-- NOTA: kolom category pada projects tetap text (fallback legacy).
-- Setelah CHECK di-drop, nilai legacy apa pun valid; proyek baru
-- sebaiknya mengisi category_id (API mengisi category text otomatis
-- dari nama kategori FK saat kategori dipilih).

-- ============================================================
-- 17. SITE SETTINGS: identitas dinamis key/value
--     (supabase/site-settings.sql)
--     FASE 2 — hero_title, hero_tagline, short_bio,
--     availability_status. Public read, admin/editor (AAL2) write.
-- ============================================================

create table if not exists public.site_settings (
  id         uuid primary key default gen_random_uuid(),
  key        text not null,
  value      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_settings
  drop constraint if exists site_settings_key_key;
alter table public.site_settings
  add constraint site_settings_key_key unique (key);

insert into public.site_settings (key, value) values
  ('hero_title',          'Network & Cyber Security Technician'),
  ('hero_tagline',        'Network & Cyber Security Portfolio'),
  ('short_bio',           'Penetration testing, security research, dan blue team defense — membangun sistem yang aman sejak awal.'),
  ('availability_status', 'open-to-work')
on conflict (key) do nothing;

create or replace function public.set_updated_at_site_settings()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at_site_settings();

alter table public.site_settings enable row level security;

drop policy if exists "site_settings_public_read" on public.site_settings;
create policy "site_settings_public_read" on public.site_settings
  for select using (true);

drop policy if exists "site_settings_auth_manage_read" on public.site_settings;
create policy "site_settings_auth_manage_read" on public.site_settings
  for select to authenticated
  using (true);

drop policy if exists "site_settings_insert_mfa_admin_editor" on public.site_settings;
create policy "site_settings_insert_mfa_admin_editor" on public.site_settings
  for insert to authenticated
  with check (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

drop policy if exists "site_settings_update_mfa_admin_editor" on public.site_settings;
create policy "site_settings_update_mfa_admin_editor" on public.site_settings
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

drop policy if exists "site_settings_delete_mfa_admin" on public.site_settings;
create policy "site_settings_delete_mfa_admin" on public.site_settings
  for delete to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;

-- ============================================================
-- 18. EXPERIENCES: Career Timeline
--     (supabase/experiences.sql)
--     FASE 2 — role, company, periode, is_current, sort_order.
--     Public read, admin/editor (AAL2) write.
-- ============================================================

create table if not exists public.experiences (
  id          uuid primary key default gen_random_uuid(),
  role        text not null,
  company     text not null,
  start_date  date not null,
  end_date    date,
  is_current  boolean not null default false,
  description text not null default '',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop index if exists experiences_sort_order_idx;
create index experiences_sort_order_idx on public.experiences (sort_order);

create or replace function public.set_updated_at_experiences()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists experiences_set_updated_at on public.experiences;
create trigger experiences_set_updated_at
  before update on public.experiences
  for each row execute function public.set_updated_at_experiences();

alter table public.experiences enable row level security;

drop policy if exists "experiences_public_read" on public.experiences;
create policy "experiences_public_read" on public.experiences
  for select using (true);

drop policy if exists "experiences_auth_manage_read" on public.experiences;
create policy "experiences_auth_manage_read" on public.experiences
  for select to authenticated
  using (true);

drop policy if exists "experiences_insert_mfa_admin_editor" on public.experiences;
create policy "experiences_insert_mfa_admin_editor" on public.experiences
  for insert to authenticated
  with check (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

drop policy if exists "experiences_update_mfa_admin_editor" on public.experiences;
create policy "experiences_update_mfa_admin_editor" on public.experiences
  for update to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

drop policy if exists "experiences_delete_mfa_admin" on public.experiences;
create policy "experiences_delete_mfa_admin" on public.experiences
  for delete to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

grant select on public.experiences to anon, authenticated;
grant insert, update, delete on public.experiences to authenticated;

-- ============================================================
-- 19. SOCIAL LINKS: tautan sosial dinamis
--     (supabase/social-links.sql)
--     FASE 2 — github/linkedin/blog. Public read,
--     admin/editor (AAL2) write.
-- ============================================================

create table if not exists public.social_links (
  id         uuid primary key default gen_random_uuid(),
  platform   text not null,
  url        text not null,
  icon       text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.social_links
  drop constraint if exists social_links_platform_key;
alter table public.social_links
  add constraint social_links_platform_key unique (platform);

drop index if exists social_links_sort_order_idx;
create index social_links_sort_order_idx on public.social_links (sort_order);

insert into public.social_links (platform, url, icon, sort_order) values
  ('github',   'https://github.com/indyadirak',         'github',   10),
  ('linkedin', 'https://www.linkedin.com/in/indyadirak', 'linkedin', 20),
  ('blog',     'https://blog.indyadirak.my.id',          'blog',     30)
on conflict (platform) do nothing;

create or replace function public.set_updated_at_social_links()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists social_links_set_updated_at on public.social_links;
create trigger social_links_set_updated_at
  before update on public.social_links
  for each row execute function public.set_updated_at_social_links();

alter table public.social_links enable row level security;

drop policy if exists "social_links_public_read" on public.social_links;
create policy "social_links_public_read" on public.social_links
  for select using (true);

drop policy if exists "social_links_auth_manage_read" on public.social_links;
create policy "social_links_auth_manage_read" on public.social_links
  for select to authenticated
  using (true);

drop policy if exists "social_links_insert_mfa_admin_editor" on public.social_links;
create policy "social_links_insert_mfa_admin_editor" on public.social_links
  for insert to authenticated
  with check (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

drop policy if exists "social_links_update_mfa_admin_editor" on public.social_links;
create policy "social_links_update_mfa_admin_editor" on public.social_links
  for update to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

drop policy if exists "social_links_delete_mfa_admin" on public.social_links;
create policy "social_links_delete_mfa_admin" on public.social_links
  for delete to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

grant select on public.social_links to anon, authenticated;
grant insert, update, delete on public.social_links to authenticated;

-- ============================================================
-- SELESAI -- SEMUA MIGRASI DITERAPKAN DALAM SATU TRANSAKSI.
-- ============================================================
commit;
