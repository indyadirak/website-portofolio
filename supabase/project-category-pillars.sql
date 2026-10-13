-- Seed: 5 kategori pilar tema portofolio (siap pakai)
-- ============================================================
-- Batch-3 A3: Cyber Security, Network Engineering, System
-- Administration, Cloud Computing, IT Support — sort_order 1-5
-- agar tampil teratas di daftar kategori.
--
-- Idempotent: on conflict (name) do nothing — aman dijalankan ulang
-- via SQL Editor, tidak menimpa edit admin/CMS. Prasyarat: tabel
-- public.project_categories (lihat project-categories.sql /
-- 00-full-migration.sql); jalankan file itu dulu bila tabel belum ada.
-- ============================================================

insert into public.project_categories (name, slug, description, sort_order, is_active) values
  ('Cyber Security',        'cyber-security',        'Penetration testing, vulnerability assessment, dan hardening.', 1, true),
  ('Network Engineering',   'network-engineering',   'Routing, switching, dan network security.',                   2, true),
  ('System Administration', 'system-administration', 'Server Linux/Windows, scripting, dan monitoring.',             3, true),
  ('Cloud Computing',       'cloud-computing',       'Arsitektur cloud, deployment, dan high availability.',        4, true),
  ('IT Support',            'it-support',            'Helpdesk dan troubleshooting hardware/software.',             5, true)
on conflict (name) do nothing;
