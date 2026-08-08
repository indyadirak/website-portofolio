import type { Project, Skill } from "../types";

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
    repoUrl: "https://github.com/your-username/red-team-recon-lab",
    liveUrl: null,
    featured: true,
    status: "active",
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
    repoUrl: "https://github.com/your-username/ids-honeypot",
    liveUrl: null,
    featured: true,
    status: "active",
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
    repoUrl: "https://github.com/your-username/secure-chat",
    liveUrl: null,
    featured: false,
    status: "archived",
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
    repoUrl: "https://github.com/your-username/log4shell-scanner",
    liveUrl: null,
    featured: false,
    status: "active",
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
    createdAt: "2023-08-30T00:00:00.000Z",
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
];

export const demoSkills: Skill[] = demoSiteSkills;
