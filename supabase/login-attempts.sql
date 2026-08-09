-- =============================================================
-- Login attempt logging (audit) — jalankan di Supabase SQL Editor
-- =============================================================

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

-- ===================== 4. CLEANUP =====================
-- Otomatis sudah dilakukan di dalam fungsi di atas (baris > 90 hari dihapus
-- setiap ada percobaan login). Untuk jadwal terpisah manual:
--   delete from public.login_attempts
--   where attempted_at < now() - interval '90 days';
--
-- Opsional (hanya bila pg_cron tersedia di project — tidak ada di Free Tier):
--   select cron.schedule('cleanup-login-attempts', '0 3 * * 0', $$
--     delete from public.login_attempts
--     where attempted_at < now() - interval '90 days';
--   $$);
