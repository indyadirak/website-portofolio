-- ============================================================
-- SEED DATA DEMO — Home Lab + Certificate
-- Aman dijalankan ulang: ON CONFLICT DO NOTHING tidak menimpa
-- data yang sudah diedit melalui Admin CMS.
-- Jalankan setelah schema dasar dan migration certificates selesai.
-- ============================================================

-- 1) HOME LAB PROJECT
insert into public.projects (
  slug,
  title,
  summary,
  description,
  category,
  category_id,
  tags,
  featured,
  status,
  problem,
  solution,
  impact
)
select
  'active-directory-soc-monitoring-home-lab',
  'Active Directory & SOC Monitoring Home Lab',
  'Lab keamanan hybrid untuk menguji segmentasi jaringan, identity security, detection engineering, dan incident response.',
  $$Home Lab untuk mensimulasikan lingkungan enterprise kecil dengan fokus pada observability dan defensive security.

Topologi jaringan:

    Internet
        |
    [ pfSense WAN ]
        |
    [ pfSense LAN ]
        |
    +---+-------------------+------------------+
    |                       |                  |
  VLAN 10                 VLAN 20            VLAN 30
  MGMT                    SERVERS            ATTACK LAB
    |                       |                  |
  Proxmox               Wazuh SIEM       Kali Linux
  Admin Workstation      Windows Server    Test Clients
                         Active Directory

Alur telemetry:

    Windows Events --> Wazuh Agent --> Wazuh Manager --> SOC Dashboard
          |                                  |
          +---------- pfSense Logs ----------+

Lab ini digunakan sebagai template Security Case Study. Isi findings dan remediation
dapat dikembangkan setelah eksperimen, simulasi serangan, dan validasi kontrol selesai dilakukan.$$,
  'Blue Team',
  categories.id,
  array['Proxmox', 'pfSense', 'Kali Linux', 'Windows Server', 'Wazuh', 'Active Directory', 'Network Security'],
  true,
  'active',
  'Membangun lingkungan latihan yang dapat merepresentasikan segmentasi jaringan enterprise, monitoring endpoint, dan investigasi alert tanpa bergantung pada infrastruktur production.',
  'Menggabungkan Proxmox sebagai hypervisor, pfSense sebagai firewall/router, VLAN terpisah untuk management, server, dan attack lab, serta Wazuh SIEM untuk koleksi log dan deteksi aktivitas mencurigakan.',
  'Menyediakan lingkungan repeatable untuk menguji detection rule, memperbaiki visibility, mendokumentasikan incident response, dan menghasilkan bukti praktik defensive security.'
from (
  select id from public.project_categories
  where slug = 'blue-team'
  limit 1
) as categories
where not exists (
  select 1 from public.projects where slug = 'active-directory-soc-monitoring-home-lab'
);

-- Fallback untuk instalasi yang belum memiliki tabel kategori dinamis atau
-- belum men-seed slug blue-team: masukkan project tanpa FK hanya bila slug
-- belum ada. Bagian ini aman dijalankan setelah insert di atas.
insert into public.projects (
  slug, title, summary, description, category, tags, featured, status,
  problem, solution, impact
)
select
  'active-directory-soc-monitoring-home-lab',
  'Active Directory & SOC Monitoring Home Lab',
  'Lab keamanan hybrid untuk menguji segmentasi jaringan, identity security, detection engineering, dan incident response.',
  'Template Home Lab: Internet -> pfSense -> VLAN -> Wazuh SIEM. Tech Stack: Proxmox, pfSense, Kali Linux, Windows Server, Wazuh.',
  'Blue Team',
  array['Proxmox', 'pfSense', 'Kali Linux', 'Windows Server', 'Wazuh'],
  true,
  'active',
  'Lingkungan latihan enterprise belum tersedia.',
  'Segmentasi VLAN, Active Directory, dan Wazuh SIEM digabungkan dalam lab terisolasi.',
  'Menyediakan dasar pengujian detection dan incident response.'
where not exists (
  select 1 from public.projects where slug = 'active-directory-soc-monitoring-home-lab'
);

-- 2) CONTOH SERTIFIKAT
insert into public.certificates (
  title,
  issuer,
  issue_date,
  credential_id,
  credential_url,
  skills,
  description,
  category,
  is_featured
)
select
  'Security Operations Fundamentals',
  'Cybersecurity Training Provider',
  date '2026-01-15',
  'DEMO-SOC-FUNDAMENTALS-2026',
  'https://portofolio.indyadirak.my.id/certificates',
  array['SOC Operations', 'Incident Response', 'Log Analysis'],
  'Contoh sertifikat untuk validasi tampilan CMS. Ganti dengan kredensial resmi dan URL verifikasi issuer melalui Admin Dashboard.',
  'training',
  false
where not exists (
  select 1 from public.certificates
  where credential_id = 'DEMO-SOC-FUNDAMENTALS-2026'
);
