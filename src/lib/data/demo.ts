import type { Certificate, Project, Skill } from "../types";

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

export const demoCertificates: Certificate[] = [
  {
    id: "c1",
    title: "Certified Ethical Hacker (CEH)",
    issuer: "EC-Council",
    issueDate: "2024-03-10",
    expiryDate: "2027-03-10",
    category: "compliance",
    credentialId: null,
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
