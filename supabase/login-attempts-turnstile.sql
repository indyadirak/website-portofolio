-- =============================================================
-- Perluas blocked_reason login_attempts: tambah 'turnstile_failed'
-- Jalankan di Supabase SQL Editor (idempotent, aman diulang).
--
-- Konteks: POST /api/auth/login kini memverifikasi token Turnstile
-- SEBELUM kredensial. Percobaan yang ditolak Turnstile dicatat sebagai
-- status 'blocked'. Constraint lama hanya mengizinkan 'lockout' dan
-- 'kv_unavailable', sehingga nilai baru akan ditolak tanpa migrasi ini.
-- =============================================================

do $$
declare
  c record;
begin
  if to_regclass('public.login_attempts') is null then
    raise notice 'Tabel public.login_attempts belum ada — lewati (jalankan login-attempts.sql dulu).';
    return;
  end if;

  -- Hapus SEMUA check constraint pada kolom blocked_reason, apa pun
  -- namanya (nama constraint bisa berbeda bila tabel dibuat manual).
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.login_attempts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%blocked_reason%'
  loop
    execute format('alter table public.login_attempts drop constraint %I', c.conname);
  end loop;

  alter table public.login_attempts
    add constraint login_attempts_blocked_reason_check
    check (blocked_reason in ('lockout', 'kv_unavailable', 'turnstile_failed'));
end $$;
