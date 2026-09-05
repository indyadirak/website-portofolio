-- ============================================================
-- FIX: RLS site_settings — update/insert 403 (FASE 1, TUGAS 1.1)
-- Jalankan di Supabase SQL Editor (idempotent, aman di-run ulang).
--
-- HANYA untuk remediasi INSTANSI PRODUKSI. Instalasi baru TIDAK perlu
-- file ini: supabase/site-settings.sql dan 00-full-migration.sql sudah
-- memuat kondisi akhir yang identik (policy insert/update aal2 + role
-- dengan using + with check, plus GRANT).
--
-- PENTING — JANGAN pakai `auth.jwt() ->> 'role'`:
--   Project ini TIDAK menyuntik claim `role` ke JWT (tidak ada custom
--   JWT claim hook di Supabase). `auth.jwt() ->> 'role'` bernilai NULL
--   untuk semua user, sehingga policy berbasis klaim itu TIDAK PERNAH
--   lolos -> 403 untuk semua orang (kemungkinan besar inilah akar
--   403 bila "fix" berbasis klaim role sudah pernah diterapkan di
--   produksi). Role di project ini selalu dibaca dari tabel
--   public.profiles via subquery — pola yang sama dengan certificates
--   (sudah terbukti jalan di produksi).
--
-- Urutan eksekusi:
--   1) DIAGNOSTIK  — identifikasi akar masalah (3 kandidat).
--   2) FIX         — re-grant + recreate policy insert/update.
--   3) VARIAN OPSIONAL — role-only TANPA aal2 (HATI-HATI, lihat catatan).
-- ============================================================

-- ============================================================
-- 1) DIAGNOSTIK — jalankan dulu, catat hasilnya
-- ============================================================

-- 1a. Policy site_settings yang AKTIF di produksi (bandingkan dengan
--     section 2 di bawah). Kalau ada policy dengan `auth.jwt() ->> 'role'`
--     di sini, itu penyebab 403.
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'site_settings'
order by policyname;

-- 1b. GRANT tabel untuk role `authenticated` (RLS tidak sempat dievaluasi
--     bila GRANT hilang — semua tulis 403, identik gejala RLS ketat).
select has_table_privilege('authenticated', 'public.site_settings', 'SELECT')  as can_select,
       has_table_privilege('authenticated', 'public.site_settings', 'INSERT')  as can_insert,
       has_table_privilege('authenticated', 'public.site_settings', 'UPDATE')  as can_update,
       has_table_privilege('authenticated', 'public.site_settings', 'DELETE')  as can_delete;

-- 1c. Role user Anda di profiles (ganti email). role TIDAK boleh 'viewer'
--     dan baris harus ada.
select p.id, u.email, p.role, p.mfa_enforced, p.created_at
from public.profiles p
join auth.users u on u.id = p.id
where u.email = 'GANTI_DENGAN_EMAIL_ADMIN_ANDA';

-- 1d. Cek klaim aal sesi saat ini (di browser admin, DevTools Console):
--     fetch('/admin/settings').then(r => r.status)  -- hanya tes konektivitas;
--     cara praktis: coba simpan setting. Bila 403 padahal 1b true & 1c admin,
--     maka JWT sesi Anda TIDAK ber-klaim aal:aal2 (sesi lama aal1 sebelum
--     alur MFA wajib, atau aal hilang setelah token refresh). Solusi:
--     logout + login ulang (pastikan langkah MFA selesai), lalu coba lagi.
-- ============================================================

-- ============================================================
-- 2) FIX — re-grant + recreate policy (idempotent)
-- ============================================================

-- 2a. GRANT eksplisit (pola rbac-mfa.sql section 5.5 — tabel via SQL
--     Editor tidak otomatis dapat GRANT).
grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;

-- 2b. INSERT: HANYA aal2 (MFA terverifikasi) + role admin/editor.
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

-- 2c. UPDATE: klausa USING dan WITH CHECK keduanya mensyaratkan aal2 +
--     role admin/editor (pola certificates_update_mfa_admin_editor).
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

-- 2d. Verifikasi pasca-recreate: harus menampilkan 5 policy
--     (public_read, auth_manage_read, insert, update, delete) dengan
--     qual/with_check memakai subquery profiles, BUKAN auth.jwt() ->> 'role'.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'site_settings'
order by policyname;

-- ============================================================
-- 3) VARIAN OPSIONAL — role-only TANPA syarat aal2
-- ============================================================
-- EKSEKUSI HANYA JIKA keputusan bisnis eksplisit dari Product Owner bahwa
-- editing site_settings TIDAK perlu MFA. Konsekuensi (WAJIB didokumentasi
-- di README + docs/SECURITY_COMPLIANCE_MAPPING.md sebagai pengecualian):
--   * MFA tidak lagi ditegakkan di level DB untuk tabel ini — menyimpang
--     dari model keamanan yang terdokumentasi (README "MFA wajib aal2
--     untuk admin/editor diberlakukan di RLS").
--   * Risiko: sesi aal1 (password saja) admin/editor bisa menulis setting
--     situs. Dampak terbatas (konten teks situs, bukan PII/kredensial),
--     tapi melanggar konsistensi RBAC dua lapis.
-- Jika dipakai, ganti section 2b & 2c dengan versi berikut:
--
-- drop policy if exists "site_settings_insert_mfa_admin_editor" on public.site_settings;
-- create policy "site_settings_insert_mfa_admin_editor" on public.site_settings
--   for insert to authenticated
--   with check (
--     exists (
--       select 1 from public.profiles
--       where profiles.id = auth.uid()
--         and profiles.role in ('admin', 'editor')
--     )
--   );
--
-- drop policy if exists "site_settings_update_mfa_admin_editor" on public.site_settings;
-- create policy "site_settings_update_mfa_admin_editor" on public.site_settings
--   for update to authenticated
--   using (
--     exists (
--       select 1 from public.profiles
--       where profiles.id = auth.uid()
--         and profiles.role in ('admin', 'editor')
--     )
--   )
--   with check (
--     exists (
--       select 1 from public.profiles
--       where profiles.id = auth.uid()
--         and profiles.role in ('admin', 'editor')
--     )
--   );
-- ============================================================
