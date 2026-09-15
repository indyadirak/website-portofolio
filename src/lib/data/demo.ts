import type {
  Certificate,
  Experience,
  Project,
  ProjectCategoryRow,
  SiteSettingRow,
  Skill,
  SocialLink,
  Writeup,
} from "../types";

/**
 * Demo data — dipakai sebagai fallback saat Supabase belum dikonfigurasi,
 * sehingga situs tetap dapat dijalankan/dibangun untuk pengembangan.
 */
export const demoProjects: Project[] = [
  {
    id: "p1",
    slug: "red-team-recon-lab",
    title: "Red Team Recon Lab",
    summary: "Environment lab untuk simulasi reconnaissance & active directory attacks.",
    description:
      "Proyek lab yang membangun environment Windows Server + Kali Linux untuk melatih teknik reconnaissance, privilege escalation, dan lateral movement pada Active Directory. Dilengkapi skenario terotomatis menggunakan Ansible.",
    category: "Red Team",
    categoryId: null,
    tags: ["Active Directory", "Kali Linux", "Ansible", "Powershell"],
    imageUrl: null,
    repoUrl: "https://github.com/indyadirak/red-team-recon-lab",
    liveUrl: null,
    featured: true,
    status: "active",
    problem:
      "Latihan red team sering terhambat oleh setup lab yang manual, mahal, dan tidak reproducible — setiap praktikan mengulang konfigurasi dari nol.",
    solution:
      "Environment lab berbasis kode (Ansible) dengan Windows Server + Kali Linux: deploy domain controller, user, GPO, dan host target dalam satu perintah, dengan skenario AD attack yang terisolasi per subnet.",
    impact:
      "Waktu setup lab turun dari hitungan hari menjadi menit, dan skenario latihan bisa dibagikan ulang secara konsisten antar anggota tim.",
    createdAt: "2025-06-01T00:00:00.000Z",
  },
  {
    id: "p2",
    slug: "ids-detection-honeypot",
    title: "IDS & Honeypot Deployment",
    summary: "Deployment Suricata IDS + honeypot untuk memantau traffic mencurigakan.",
    description:
      "Implementasi Suricata sebagai Intrusion Detection System dengan dashboard Grafana/Loki, ditambah honeypot Cowrie untuk mengumpulkan intelijen serangan brute-force dan menampilkan analisis serangan secara real-time.",
    category: "Blue Team",
    categoryId: null,
    tags: ["Suricata", "Grafana", "Loki", "Cowrie", "Docker"],
    imageUrl: null,
    repoUrl: "https://github.com/indyadirak/ids-honeypot",
    liveUrl: null,
    featured: true,
    status: "active",
    problem:
      "Jaringan eksperimen tidak memiliki visibilitas lalu lintas: serangan brute-force dan scanning berlangsung tanpa tercatat maupun dilaporkan.",
    solution:
      "Deployment Suricata IDS dengan ruleset terkini + honeypot Cowrie di DMZ, log dialirkan ke Loki dan divisualisasikan di Grafana dengan alerting Telegram.",
    impact:
      "Semua percobaan login dan scanning kini terdeteksi dalam < 1 menit, dengan riwayat serangan tersimpan untuk analisis tren dan hardening.",
    createdAt: "2025-09-15T00:00:00.000Z",
  },
  {
    id: "p3",
    slug: "secure-chat-encryption",
    title: "Secure Chat with E2E Encryption",
    summary: "Aplikasi chat real-time dengan end-to-end encryption berbasis libsodium.",
    description:
      "Aplikasi chat menggunakan WebSocket dengan enkripsi end-to-end (X25519 + ChaCha20-Poly1305). Mencakup forward secrecy dan verifikasi fingerprint antar pengguna.",
    category: "Web App",
    categoryId: null,
    tags: ["TypeScript", "WebSocket", "libsodium", "Crypto"],
    imageUrl: null,
    repoUrl: "https://github.com/indyadirak/secure-chat",
    liveUrl: null,
    featured: false,
    status: "archived",
    problem:
      "Solusi chat pihak ketiga menyimpan pesan dalam bentuk plaintext di server, berisiko terhadap penyalahgunaan dan kebocoran data.",
    solution:
      "Prototipe chat WebSocket dengan E2E encryption X25519 + ChaCha20-Poly1305, forward secrecy via double ratchet sederhana, dan verifikasi fingerprint manual.",
    impact:
      "Membuktikan bahwa chat encrypted ujung-ke-ujung bisa dibangun dengan library ringan tanpa layanan pihak ketiga.",
    createdAt: "2024-11-20T00:00:00.000Z",
  },
  {
    id: "p4",
    slug: "phishing-analyzer",
    title: "Phishing URL Analyzer",
    summary: "Tools analisis URL phishing dengan heuristics dan threat intel feeds.",
    description:
      "Web app untuk menganalisis URL mencurigakan menggunakan heuristics scoring, reputasi domain, dan integrasi threat intelligence feeds (URLhaus, PhishTank).",
    category: "Defensive",
    categoryId: null,
    tags: ["Python", "Flask", "Threat Intel", "Machine Learning"],
    imageUrl: null,
    repoUrl: null,
    liveUrl: null,
    featured: false,
    status: "planned",
    problem:
      "Pengguna dan tim kecil tidak punya cara cepat untuk menilai apakah sebuah URL adalah phishing sebelum mengkliknya.",
    solution:
      "Web app analisis URL dengan heuristics scoring (typosquatting, usia domain, redirect), lookup reputasi ke URLhaus/PhishTank, dan skor risiko akhir.",
    impact:
      "Perencanaan: memangkas waktu verifikasi URL dari menit menjadi detik untuk tim SOC skala kecil.",
    createdAt: "2026-01-05T00:00:00.000Z",
  },
  {
    id: "p5",
    slug: "log4j-vuln-scanner",
    title: "Log4Shell Scanner",
    summary: "Scanner otomatis deteksi kerentanan Log4Shell (CVE-2021-44228).",
    description:
      "Script otomatis untuk mendeteksi kerentanan Log4Shell pada target via header injection dan payload jndi, lengkap dengan report berbentuk HTML.",
    category: "Red Team",
    categoryId: null,
    tags: ["Python", "CVE", "Exploitation", "Reporting"],
    imageUrl: null,
    repoUrl: "https://github.com/indyadirak/log4shell-scanner",
    liveUrl: null,
    featured: false,
    status: "active",
    problem:
      "Pasca-CVE-2021-44228, banyak aplikasi internal belum terverifikasi kerentanannya dan audit manual tidak scalable.",
    solution:
      "Scanner Python dengan payload jndi di header HTTP standar (User-Agent, X-Forwarded-For, dll.), callback detection, dan report HTML per-target.",
    impact:
      "Memungkinkan verifikasi ratusan host dalam beberapa jam, dengan bukti callback yang dapat diaudit.",
    createdAt: "2024-04-10T00:00:00.000Z",
  },
  {
    id: "p6",
    slug: "wireless-security-audit",
    title: "Wireless Security Audit Kit",
    summary: "Kit audit keamanan jaringan wireless menggunakan Raspberry Pi.",
    description:
      "Sistem portable berbasis Raspberry Pi untuk melakukan wireless security assessment, mencakup capture & analysis WPA2 handshake serta deteksi rogue access point.",
    category: "Network",
    categoryId: null,
    tags: ["Raspberry Pi", "Wireshark", "802.11", "Python"],
    imageUrl: null,
    repoUrl: null,
    liveUrl: null,
    featured: false,
    status: "archived",
    problem:
      "Audit wireless di lokasi klien membutuhkan perangkat yang bulky dan penyiapan yang lama setiap kali digunakan.",
    solution:
      "Kit portable Raspberry Pi dengan mode monitor, toolset WPA2 handshake capture, dan scanner rogue AP dengan output laporan terstruktur.",
    impact:
      "Audit lapangan menjadi one-shot boot & scan, mengurangi waktu persiapan di lokasi secara signifikan.",
    createdAt: "2023-08-30T00:00:00.000Z",
  },
];

/**
 * Kategori demo — mencerminkan seed project-categories.sql (14 entri).
 * Dipakai getProjectCategories() saat Supabase belum dikonfigurasi.
 */
export const demoProjectCategories: ProjectCategoryRow[] = [
  { id: "cat-web", name: "Web App", slug: "web-app", description: null, sort_order: 10, is_active: true, created_at: "2023-01-01T00:00:00.000Z", updated_at: "2023-01-01T00:00:00.000Z" },
  { id: "cat-mobile", name: "Mobile", slug: "mobile", description: null, sort_order: 20, is_active: true, created_at: "2023-01-01T00:00:00.000Z", updated_at: "2023-01-01T00:00:00.000Z" },
  { id: "cat-network", name: "Network", slug: "network", description: null, sort_order: 30, is_active: true, created_at: "2023-01-01T00:00:00.000Z", updated_at: "2023-01-01T00:00:00.000Z" },
  { id: "cat-iot", name: "IoT", slug: "iot", description: null, sort_order: 40, is_active: true, created_at: "2023-01-01T00:00:00.000Z", updated_at: "2023-01-01T00:00:00.000Z" },
  { id: "cat-redteam", name: "Red Team", slug: "red-team", description: null, sort_order: 50, is_active: true, created_at: "2023-01-01T00:00:00.000Z", updated_at: "2023-01-01T00:00:00.000Z" },
  { id: "cat-blueteam", name: "Blue Team", slug: "blue-team", description: null, sort_order: 60, is_active: true, created_at: "2023-01-01T00:00:00.000Z", updated_at: "2023-01-01T00:00:00.000Z" },
  { id: "cat-defensive", name: "Defensive", slug: "defensive", description: null, sort_order: 70, is_active: true, created_at: "2023-01-01T00:00:00.000Z", updated_at: "2023-01-01T00:00:00.000Z" },
  { id: "cat-osint", name: "OSINT", slug: "osint", description: null, sort_order: 80, is_active: true, created_at: "2023-01-01T00:00:00.000Z", updated_at: "2023-01-01T00:00:00.000Z" },
  { id: "cat-forensics", name: "Forensics", slug: "forensics", description: null, sort_order: 90, is_active: true, created_at: "2023-01-01T00:00:00.000Z", updated_at: "2023-01-01T00:00:00.000Z" },
  { id: "cat-malware", name: "Malware Analysis", slug: "malware-analysis", description: null, sort_order: 100, is_active: true, created_at: "2023-01-01T00:00:00.000Z", updated_at: "2023-01-01T00:00:00.000Z" },
  { id: "cat-crypto", name: "Cryptography", slug: "cryptography", description: null, sort_order: 110, is_active: true, created_at: "2023-01-01T00:00:00.000Z", updated_at: "2023-01-01T00:00:00.000Z" },
  { id: "cat-seceng", name: "Security Engineering", slug: "security-engineering", description: null, sort_order: 120, is_active: true, created_at: "2023-01-01T00:00:00.000Z", updated_at: "2023-01-01T00:00:00.000Z" },
  { id: "cat-cloud", name: "Cloud Security", slug: "cloud-security", description: null, sort_order: 130, is_active: true, created_at: "2023-01-01T00:00:00.000Z", updated_at: "2023-01-01T00:00:00.000Z" },
  { id: "cat-devsecops", name: "DevSecOps", slug: "devsecops", description: null, sort_order: 140, is_active: true, created_at: "2023-01-01T00:00:00.000Z", updated_at: "2023-01-01T00:00:00.000Z" },
];

export const demoCertificates: Certificate[] = [
  {
    id: "c1",
    title: "Certified Ethical Hacker (CEH)",
    issuer: "EC-Council",
    issueDate: "2024-03-10",
    expiryDate: "2027-03-10",
    category: "compliance",
    isFeatured: true,
    shortDescriptionId: "Sertifikasi ethical hacking dengan fokus metodologi penilaian kerentanan end-to-end.",
    shortDescriptionEn: "Ethical hacking certification focused on end-to-end vulnerability assessment methodology.",
    credentialId: "ECC-DEMO-VERIFY-2026",
    credentialUrl: "https://www.eccouncil.org/",
    verificationUrl: "https://aspen.eccouncil.org/verifyBadge",
    skills: ["Penetration Testing", "Network Security", "Vulnerability Assessment"],
    description: null,
    fileUrl: null,
    createdBy: null,
    createdAt: "2024-03-10T00:00:00.000Z",
    updatedAt: "2024-03-10T00:00:00.000Z",
  },
  {
    id: "c2",
    title: "CompTIA Security+",
    issuer: "CompTIA",
    issueDate: "2023-08-01",
    expiryDate: "2026-08-01",
    category: "compliance",
    isFeatured: false,
    shortDescriptionId: "Dasar keamanan jaringan, manajemen risiko, dan respons insiden.",
    shortDescriptionEn: "Foundations of network security, risk management, and incident response.",
    credentialId: null,
    credentialUrl: null,
    verificationUrl: null,
    skills: ["Security Fundamentals", "Risk Management", "Incident Response"],
    description: null,
    fileUrl: null,
    createdBy: null,
    createdAt: "2023-08-01T00:00:00.000Z",
    updatedAt: "2023-08-01T00:00:00.000Z",
  },
  {
    id: "c3",
    title: "Network & Cyber Security Technician",
    issuer: "Balai Harta Peninggalan Surabaya",
    issueDate: "2025-01-20",
    expiryDate: null,
    category: "training",
    isFeatured: true,
    shortDescriptionId: null,
    shortDescriptionEn: null,
    credentialId: null,
    credentialUrl: null,
    verificationUrl: null,
    skills: ["Network Defense", "Infrastructure Security", "System Monitoring"],
    description: null,
    fileUrl: null,
    createdBy: null,
    createdAt: "2025-01-20T00:00:00.000Z",
    updatedAt: "2025-01-20T00:00:00.000Z",
  },
  {
    id: "c4",
    title: "Cyber Security Awareness & SOC Operations",
    issuer: "Laboratorium Jaringan Komputer",
    issueDate: "2024-11-05",
    expiryDate: null,
    category: "training",
    isFeatured: false,
    shortDescriptionId: null,
    shortDescriptionEn: null,
    credentialId: null,
    credentialUrl: null,
    verificationUrl: null,
    skills: ["SOC", "Security Monitoring", "Threat Detection"],
    description: null,
    fileUrl: null,
    createdBy: null,
    createdAt: "2024-11-05T00:00:00.000Z",
    updatedAt: "2024-11-05T00:00:00.000Z",
  },
];

export const demoSiteSkills: Skill[] = [
  { id: "s1", name: "Penetration Testing", category: "Offensive", level: "advanced", icon: "🔓" },
  { id: "s2", name: "Red Team Operations", category: "Offensive", level: "intermediate", icon: "🎯" },
  { id: "s3", name: "Malware Analysis", category: "Defensive", level: "intermediate", icon: "🦠" },
  { id: "s4", name: "Incident Response", category: "Defensive", level: "advanced", icon: "🚨" },
  { id: "s5", name: "Network Monitoring (IDS)", category: "Defensive", level: "advanced", icon: "📡" },
  { id: "s6", name: "Kali Linux / Metasploit", category: "Tools", level: "advanced", icon: "🐧" },
  { id: "s7", name: "Wireshark", category: "Tools", level: "expert", icon: "🦈" },
  { id: "s8", name: "Burp Suite", category: "Tools", level: "advanced", icon: "🧪" },
  { id: "s9", name: "TypeScript / Python", category: "Programming", level: "advanced", icon: "💻" },
  { id: "s10", name: "Bash / Powershell Scripting", category: "Programming", level: "expert", icon: "⚙️" },
  { id: "s11", name: "Security Awareness Training", category: "Soft Skill", level: "advanced", icon: "🎓" },
  { id: "s12", name: "Security Documentation", category: "Soft Skill", level: "expert", icon: "📝" },
  { id: "s13", name: "VLAN & Routing (Mikrotik/Cisco)", category: "Network", level: "expert", icon: "🌐" },
  { id: "s14", name: "Firewall & NAT Configuration", category: "Network", level: "advanced", icon: "🧱" },
  { id: "s15", name: "Digital Forensics", category: "Forensics", level: "intermediate", icon: "🔍" },
  { id: "s16", name: "Log Analysis & Triage", category: "Forensics", level: "advanced", icon: "📋" },
];

export const demoSkills: Skill[] = demoSiteSkills;

/**
 * Identitas dinamis default — fallback getSiteSettings() saat Supabase
 * belum dikonfigurasi. Nilai identik dengan seed site-settings.sql dan
 * fallback di src/lib/config.ts / i18n.
 */
export const demoSiteSettings: SiteSettingRow[] = [
  { id: "ss-hero-title", key: "hero_title", value: "Network & Cyber Security Technician", created_at: "2025-01-01T00:00:00.000Z", updated_at: "2025-01-01T00:00:00.000Z" },
  { id: "ss-hero-tagline", key: "hero_tagline", value: "Network & Cyber Security Portfolio", created_at: "2025-01-01T00:00:00.000Z", updated_at: "2025-01-01T00:00:00.000Z" },
  { id: "ss-short-bio", key: "short_bio", value: "Penetration testing, security research, dan blue team defense — membangun sistem yang aman sejak awal.", created_at: "2025-01-01T00:00:00.000Z", updated_at: "2025-01-01T00:00:00.000Z" },
  { id: "ss-availability", key: "availability_status", value: "open-to-work", created_at: "2025-01-01T00:00:00.000Z", updated_at: "2025-01-01T00:00:00.000Z" },
];

/**
 * Career timeline demo — fallback getExperiences() saat Supabase belum
 * dikonfigurasi (hanya dipakai saat pengembangan lokal tanpa env).
 */
export const demoExperiences: Experience[] = [
  {
    id: "e1",
    role: "Security Operations Analyst",
    company: "Balai Harta Peninggalan Surabaya",
    startDate: "2024-03",
    endDate: null,
    isCurrent: true,
    description:
      "Monitoring keamanan jaringan, triage alert Suricata, dan hardening infrastruktur jaringan kantor (VLAN, firewall, NAC).",
    sortOrder: 10,
  },
  {
    id: "e2",
    role: "Network & Cyber Security Technician",
    company: "Balai Harta Peninggalan Surabaya",
    startDate: "2023-08",
    endDate: "2024-02",
    isCurrent: false,
    description:
      "Pengelolaan jaringan lokal, instalasi & konfigurasi perangkat keamanan, serta dokumentasi prosedur operasional.",
    sortOrder: 20,
  },
  {
    id: "e3",
    role: "IT Support & Lab Assistant",
    company: "Laboratorium Jaringan Komputer",
    startDate: "2022-09",
    endDate: "2023-07",
    isCurrent: false,
    description:
      "Pendampingan praktikum jaringan & keamanan, perawatan perangkat lab, dan simulasi serangan bertarget untuk materi SOC.",
    sortOrder: 30,
  },
];

/**
 * Tautan sosial default — fallback getSocialLinks() saat Supabase belum
 * dikonfigurasi. Identik dengan seed social-links.sql (config.ts).
 */
export const demoSocialLinks: SocialLink[] = [
  { id: "sl-github", platform: "github", url: "https://github.com/indyadirak", icon: "github", sortOrder: 10, createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "sl-linkedin", platform: "linkedin", url: "https://www.linkedin.com/in/indyadirak", icon: "linkedin", sortOrder: 20, createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "sl-blog", platform: "blog", url: "https://blog.indyadirak.my.id", icon: "blog", sortOrder: 30, createdAt: "2025-01-01T00:00:00.000Z" },
];

/** Write-up demo — mencerminkan baris DEMO di supabase/seed-data.sql. */
export const demoWriteups: Writeup[] = [
  {
    id: "w1",
    title: "DEMO - Analytics Web Server (Web Exploitation Case Study)",
    slug: "demo-analytics-web-server-case-study",
    targetEnv: "DEMO - TryHackMe-style machine",
    methodology: "OWASP",
    severity: "High",
    findings: `Overview:
Mesin demo dengan web analytics yang mengekspos endpoint debug ke publik. Write-up contoh ini menampilkan struktur laporan profesional yang dirender otomatis oleh situs - ganti seluruh isinya dengan hasil riset Anda sendiri melalui Admin CMS.

Attack Path:
- step 1: directory busting menemukan /debug/status tanpa autentikasi
- step 2: endpoint membocorkan versi framework + path absolut aplikasi
- step 3: error handler menampilkan stack trace dengan connection string
- step 4: rantai berakhir pada remote code execution via fitur import

Detection:
\`\`\`
# log WAF yang menjadi titik balik investigasi
POST /import 400 - user-agent python-requests/2.31
GET  /debug/status 200 - source ip 203.0.113.10
\`\`\`

Lessons Learned:
- endpoint debug tidak boleh ada di build production, bukan sekadar dibatasi IP`,
    remediation: `Mitigation:
- hapus modul debug dari konfigurasi production (fail-closed)
- matikan stack trace publik; log detail hanya di server side
- validasi tipe file dan ukuran pada fitur import
- wrapper WAF rule untuk /debug/* -> 404

Lessons Learned:
- amankan rantai build, bukan hanya runtime
- biasakan threat model kecil sebelum fitur import-like dirilis`,
    status: "published",
    isPublished: true,
    createdBy: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    id: "w2",
    title: "DEMO - Deteksi Lateral Movement di Home Lab AD",
    slug: "demo-ad-lateral-movement-detection",
    targetEnv: "DEMO - Home Lab Active Directory",
    methodology: "MITRE ATT&CK",
    severity: "Med",
    findings: `Overview:
Latihan blue team di lab: mensimulasikan Pass-the-Hash antar host Windows dan mengukur berapa cepat SOC stack (Wazuh + Suricata) mendeteksinya.

Attack Path:
- initial access: phishing simulasi pada host user01
- credential dumping via sekurlsa saat LSASS tidak di-protection
- lateral movement SMB admin$ ke host server01

Detection:
\`\`\`
EventID 4624 type 3  -> logon jaringan mencurigakan (admin$)
EventID 4672         -> special privileges assigned
sysmon 10            -> access to LSASS process
\`\`\``,
    remediation: `Mitigation:
- group policy: batasi admin lokal hanya ke JIT group
- LAPS untuk rotate password admin lokal
- enable RunAsPPL agar LSASS dilindungi dari read

Lessons Learned:
- deteksi berbasis event ID saja cukup untuk lab, tapi di produksi
  korelasi multi-host memperkecil false positive
- dokumentasikan baseline dulu sebelum pasang alert`,
    status: "published",
    isPublished: true,
    createdBy: null,
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
  },
];
