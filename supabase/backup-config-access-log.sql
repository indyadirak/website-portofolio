-- =============================================================
-- Backup config access log (audit) — /api/backup-config (GitHub Actions)
-- Jalankan di Supabase SQL Editor (sekali eksekusi, idempotent).
-- =============================================================
--
-- Mencatat SETIAP percobaan akses ke endpoint yang me-return kredensial
-- backup TERDEKRIPSI. Hanya metadata (IP, user-agent, status) — Bearer
-- token dan isi kredensial TIDAK pernah dicatat (privacy & keamanan).
--
-- ALASAN TABEL TERPISAH (bukan reuse login_attempts):
--   * Semantik berbeda — login_attempts adalah percobaan autentikasi
--     login manusia; tabel ini akses API server-to-server.
--   * Skema status berbeda ('rate_limited' vs 'lockout') — mencampur
--     akan mengotori statistik login dan menyalahgunakan kolom email.
--
-- Penulisan HANYA via service_role (Worker endpoint memakai
-- SUPABASE_SERVICE_ROLE_KEY) — anon/authenticated tidak punya akses
-- tulis maupun baca kecuali policy SELECT admin di bawah.

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

-- ===================== 3. CLEANUP =====================
-- Endpoint melakukan delete baris > 90 hari setiap kali mencatat (lihat
-- logAccess di src/pages/api/backup-config.ts). Alternatif jadwal manual:
--   delete from public.backup_config_access_log
--   where attempted_at < now() - interval '90 days';
--
-- Opsional (hanya bila pg_cron tersedia — tidak ada di Free Tier):
--   select cron.schedule('cleanup-backup-config-access', '0 4 * * 0', $$
--     delete from public.backup_config_access_log
--     where attempted_at < now() - interval '90 days';
--   $$);
