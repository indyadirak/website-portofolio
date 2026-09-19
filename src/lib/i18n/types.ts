/**
 * Kamus terjemahan UI — diketik ketat agar key yang hilang terdeteksi
 * saat compile. Tambahkan key baru di ketiga file (types, id, en).
 */
export interface Dictionary {
  langName: string;
  nav: {
    home: string;
    projects: string;
    writeups: string;
    certificates: string;
    about: string;
    security: string;
    contact: string;
    blog: string;
    downloadCv: string;
    menu: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    badge: string;
    role: string;
    tagline: string;
    description: string;
    viewProjects: string;
    contactMe: string;
    downloadCv: string;
    statusOpen: string;
    statusClosed: string;
    statsLabel: string;
    statsProjects: string;
    statsCertificates: string;
    statsStatus: string;
    statsOpen: string;
    statsClosed: string;
  };
  opsLog: {
    eyebrow: string;
    title: string;
    header: string;
    command: string;
    startMarker: string;
    roleLabel: string;
    organizationLabel: string;
    periodLabel: string;
    statusLabel: string;
    currentStatus: string;
    completedStatus: string;
    endMarker: string;
    cursor: string;
  };
  home: {
    featuredEyebrow: string;
    featuredTitle: string;
    featuredDescription: string;
    viewAllProjects: string;
    skillsEyebrow: string;
    skillsTitle: string;
    skillsDescription: string;
    /** SP4A.4: panel "System Status" bergaya dashboard SOC di homepage. */
    statusEyebrow: string;
    statusTitle: string;
    statusWebsite: string;
    statusWebsiteValue: string;
    statusHttps: string;
    statusHttpsValue: string;
    statusCsp: string;
    statusCspValue: string;
    statusAudit: string;
    statusNote: string;
  };
  skills: {
    all: string;
    empty: string;
    /** SPRINT 1: empty state UTUH (tidak ada skill sama sekali). */
    emptyAll: string;
    /** Label kategori skill yang dilokalisasi (kunci = nilai enum kategori). */
    categories: {
      offensive: string;
      defensive: string;
      tools: string;
      programming: string;
      network: string;
      forensics: string;
      softSkill: string;
    };
  };
  certificates: {
    eyebrow: string;
    title: string;
    description: string;
    all: string;
    compliance: string;
    training: string;
    empty: string;
    /** Empty state UTUH (tidak ada sertifikat sama sekali) — tampilan terminal. */
    emptyAll: string;
    /** Label field/ID kredensial — diverifikasi publik (SP: verifiable credentials). */
    credentialId: string;
    verificationUrl: string;
    /** Tombol verifikasi kredensial pada kartu sertifikat. */
    verifyCredential: string;
    /** aria-label tautan credential halaman issuer — placeholder {title}. */
    credentialLink: string;
    featured: string;
    /** Template badge masa berlaku — placeholder {date} diganti format locale. */
    validUntil: string;
    expired: string;
  };
  /** CTA penutup halaman publik — ajak menghubungi admin. */
  cta: {
    eyebrow: string;
    title: string;
    description: string;
    buttonLabel: string;
  };
  dashboard: {
    title: string;
    description: string;
    /** Prompt terminal sapaan: "root@portofolio:~$ whoami". */
    shellPrompt: string;
    /** Sapaan — placeholder {name} diganti nama/email admin. */
    welcomeBack: string;
    statProjects: string;
    statCertificates: string;
    statInbox: string;
    statWriteups: string;
    quickActions: string;
    /** Tombol quick action besar — 3 aksi utama. */
    quickNewProject: string;
    quickNewWriteup: string;
    quickNewCertificate: string;
    newProject: string;
    newWriteup: string;
    manageCategories: string;
    manageSettings: string;
    manageExperiences: string;
    manageSocialLinks: string;
    viewCertificates: string;
    systemStatus: string;
    statusDb: string;
    statusRateLimit: string;
    statusRls: string;
    statusMfa: string;
    statusHsts: string;
    /** Prefiks indikator status: OK (hijau) / FAIL (merah). */
    statusOk: string;
    statusFail: string;
    /** Label status DB saat koneksi gagal (fallback, bukan crash halaman). */
    statusDbFail: string;
    /** Feed aktivitas terbaru (data minimization: ringkasan aksi saja). */
    activityTitle: string;
    activityEmpty: string;
    activityModuleWriteup: string;
    /** Aksi entry feed — placeholder {title} isi judul write-up. */
    activityNewWriteup: string;
    expiryTitle: string;
    projectsTitle: string;
    certificatesTitle: string;
    contactTitle: string;
    total: string;
  };
  projects: {
    eyebrow: string;
    title: string;
    description: string;
    noProjects: string;
    /** SPRINT 1: label bagian Security Case Study di halaman detail. */
    overviewLabel: string;
    methodologyLabel: string;
    attackPathLabel: string;
    detectionLabel: string;
    mitigationLabel: string;
    details: string;
    repo: string;
    live: string;
    statusLabel: string;
    addedLabel: string;
    sourceCode: string;
    liveDemo: string;
    relatedTitle: string;
    problemLabel: string;
    approachLabel: string;
    impactLabel: string;
    secondaryTitle: string;
    secondaryDescription: string;
    expandSecondary: string;
    collapseSecondary: string;
    secondaryEmpty: string;
    featuredLabel: string;
    /** B2: filter kategori dinamis + empty state per kategori. */
    filterLabel: string;
    allCategories: string;
    categoryEmpty: string;
  };
  imageZoom: {
    closeLabel: string;
  };
  cv: {
    noticeTitle: string;
    noticeMessage: string;
    closeLabel: string;
    /** Tautan alternatif ke halaman Security CV saat PDF belum tersedia. */
    noticePrintLink: string;
    /** Label & isi halaman /security-cv — CV siap cetak, terformat terminal. */
    securityCv: {
      eyebrow: string;
      title: string;
      description: string;
      intro: string;
      printLabel: string;
      printHint: string;
      summaryTitle: string;
      homeLabTitle: string;
      homeLabNote: string;
      /** Placeholder topologi ASCII — ganti via CMS saat lab dokumentatif siap. */
      homeLabDiagram: string[];
      certTitle: string;
      certEmpty: string;
      credentialLabel: string;
      skillsTitle: string;
      experienceTitle: string;
      experienceEmpty: string;
      contactTitle: string;
      footerNote: string;
    };
    /** Kartu tautan Security CV di halaman About. */
    aboutCtaTitle: string;
    aboutCtaDescription: string;
    aboutCtaButton: string;
  };
  about: {
    eyebrow: string;
    title: string;
    paragraphs: string[];
    specializationsTitle: string;
    specializations: string[];
    contactTitle: string;
    emailLabel: string;
    githubLabel: string;
    linkedinLabel: string;
    availabilityLabel: string;
    openToWork: string;
    notAvailable: string;
    knowsAbout: string[];
    /** Career timeline (FASE 3 — dinamis dari tabel experiences). */
    timelineEyebrow: string;
    timelineTitle: string;
    timelineEmpty: string;
    /** Label pengganti tanggal berakhir untuk posisi yang masih berjalan. */
    periodNow: string;
  };
  contact: {
    eyebrow: string;
    title: string;
    description: string;
    formName: string;
    formEmail: string;
    formMessage: string;
    namePlaceholder: string;
    emailPlaceholder: string;
    messagePlaceholder: string;
    sendMessage: string;
    success: string;
    errorPrefix: string;
    tooManyRequests: string;
    notConfigured: string;
    sendFailed: string;
    directEmailTitle: string;
    orVia: string;
    note: string;
    captchaRequired: string;
    captchaUnavailable: string;
    /** SP4A.2: komunikasi terenkripsi PGP di bawah form kontak. */
    pgpTitle: string;
    pgpDescription: string;
    pgpFingerprintLabel: string;
    pgpKeyIdLabel: string;
    pgpDownload: string;
  };
  footer: {
    /** Label link GitHub (dipakai juga di Hero.astro). */
    github: string;
    linkedin: string;
    /** Heading kolom 1 (Legal & Security). */
    legalSecurity: string;
    /** Label link /security. */
    securityPolicy: string;
    /** Label link /privacy. */
    privacyPolicy: string;
    /** Heading kolom 2 (Connect). */
    connect: string;
    /** Teks status sistem bergaya terminal (HSTS, CSP, versi). */
    systemStatus: string;
    /** Baris copyright — placeholder {year} dan {author}. */
    copyright: string;
  };
  privacy: {
    eyebrow: string;
    title: string;
    description: string;
    lastUpdated: string;
    sections: {
      collectedTitle: string;
      collected: string[];
      purposeTitle: string;
      purpose: string[];
      storageTitle: string;
      storage: string[];
      retentionTitle: string;
      retention: string[];
      sharingTitle: string;
      sharing: string[];
      cookiesTitle: string;
      cookies: string[];
      rightsTitle: string;
      rights: string[];
      contactTitle: string;
      contact: string[];
    };
  };
  /** SP4A.1: halaman threat model publik di /security. */
  security: {
    eyebrow: string;
    title: string;
    description: string;
    lastUpdated: string;
    diagramTitle: string;
    /** Baris ASCII art — di-render monospace dengan pewarnaan per baris. */
    diagram: string[];
    controlsTitle: string;
    /** Tabel kontrol keamanan aktif (bukan klaim — sesuai middleware/_headers). */
    controls: { name: string; status: string; detail: string }[];
    implementationTitle: string;
    sections: {
      architectureTitle: string;
      architecture: string[];
      headersTitle: string;
      headers: string[];
      authenticationTitle: string;
      authentication: string[];
      dataProtectionTitle: string;
      dataProtection: string[];
      decisionsTitle: string;
      decisions: string[];
      threatModelTitle: string;
      threatModel: string[];
    };
    disclosureTitle: string;
    disclosureIntro: string;
    responseTitle: string;
    responseTime: string;
    scopeTitle: string;
    scope: string[];
    outOfScopeTitle: string;
    outOfScope: string[];
    safeHarborTitle: string;
    safeHarbor: string[];
    channelsTitle: string;
    channels: string[];
  };
  writeups: {
    eyebrow: string;
    title: string;
    subtitle: string;
    emptyNote: string;
    emptyTitle: string;
    detail: {
      back: string;
      target: string;
      methodology: string;
      severity: string;
      findings: string;
      remediation: string;
      published: string;
      updated: string;
    };
    /** SP4A.3: header kanonik case study — pemetaan judul bagian dalam konten. */
    caseStudy: {
      overview: string;
      methodology: string;
      attackPath: string;
      detection: string;
      mitigation: string;
      lessonsLearned: string;
    };
  };
  adminWriteups: {
    status: string;
    draft: string;
    published: string;
    publish: string;
    unpublish: string;
    /** Panduan header case study di form write-up. */
    caseStudyHint: string;
    caseStudyFenceHint: string;
    /** SPRINT 1: judul form, panduan terstruktur, dan helper per bagian. */
    formTitleNew: string;
    formTitleEdit: string;
    backToList: string;
    caseStudyTitle: string;
    caseStudyIntro: string;
    methodologyHelper: string;
    findingsHelper: string;
    findingsPlaceholder: string;
    remediationHelper: string;
    remediationPlaceholder: string;
    sectionGuideTitle: string;
  };
  /** SPRINT 1: UI umum form admin (shell, alert, helper). */
  adminForm: {
    /** Judul alert error di atas tombol submit. */
    errorTitle: string;
    /** Pesan saat error tidak dikenal (fallback kode mentah tetap ditampilkan). */
    errorUnknown: string;
    /** Label bagian form (fieldset) untuk struktur case study. */
    sectionEvidence: string;
    sectionMeta: string;
  };
  /** SPRINT 1: struktur Security Case Study pada form project. */
  adminProjectsForm: {
    caseStudyTitle: string;
    caseStudyIntro: string;
    overviewHelper: string;
    overviewPlaceholder: string;
    methodologyHelper: string;
    methodologyPlaceholder: string;
    attackPathHelper: string;
    attackPathPlaceholder: string;
    detectionHelper: string;
    detectionPlaceholder: string;
    mitigationHelper: string;
    mitigationPlaceholder: string;
    impactHelper: string;
    impactPlaceholder: string;
    descriptionHelper: string;
  };
  /** FASE 2: Admin — edit identitas situs (site_settings). */
  adminSettings: {
    eyebrow: string;
    title: string;
    description: string;
    heroTitle: string;
    heroTagline: string;
    shortBio: string;
    aboutBio: string;
    specializations: string;
    contactInfo: string;
    specializationsPlaceholder: string;
    contactInfoPlaceholder: string;
    availability: string;
    availabilityOpen: string;
    availabilityClosed: string;
    save: string;
    saved: string;
    errorPrefix: string;
    back: string;
    keyColumn: string;
    valueColumn: string;
  };
  /** FASE 2: Admin — kelola Career Timeline (experiences). */
  adminExperiences: {
    eyebrow: string;
    title: string;
    newMode: string;
    editMode: string;
    saveNew: string;
    saveEdit: string;
    cancelEdit: string;
    role: string;
    company: string;
    startDate: string;
    endDate: string;
    isCurrent: string;
    description: string;
    sortOrder: string;
    currentBadge: string;
    total: string;
    emptyNote: string;
    /** Petunjuk format di bawah date picker. */
    dateHelper: string;
    edit: string;
    delete: string;
    deleteConfirm: string;
    back: string;
    saved: string;
    errorPrefix: string;
  };
  /** FASE 2: Admin — kelola tautan sosial (social_links). */
  adminSocialLinks: {
    eyebrow: string;
    title: string;
    newMode: string;
    editMode: string;
    saveNew: string;
    saveEdit: string;
    cancelEdit: string;
    platform: string;
    platformPlaceholder: string;
    url: string;
    icon: string;
    iconPlaceholder: string;
    actions: string;
    sortOrder: string;
    total: string;
    emptyNote: string;
    edit: string;
    delete: string;
    deleteConfirm: string;
    back: string;
    saved: string;
    errorPrefix: string;
  };
  /** Shared: teks utilitas komponen UI reusable. */
  ui: {
    /** Baris "total 0" pada TerminalEmptyState. */
    totalZero: string;
    /** Skip-link keyboard di MainLayout & AdminLayout (WCAG 2.4.1). */
    skipToContent: string;
  };
  /**
   * Pemetaan kode error API (snake_case) -> pesan manusiawi untuk admin.
   * Record longgar sengaja: fallback client = tampilkan kode mentah,
   * sehingga key baru di API tidak pernah membuat UI rusak.
   */
  errors: Record<string, string>;
  /** Manajemen pesan kontak (admin/messages) — FASE 2. */
  adminMessages: {
    eyebrow: string;
    title: string;
    total: string;
    emptyNote: string;
    thSender: string;
    thDate: string;
    thStatus: string;
    thMessage: string;
    thActions: string;
    unread: string;
    read: string;
    markRead: string;
    /** Tombol expand pesan lengkap pada kartu mobile (layout < md). */
    readFull: string;
    fullMessage: string;
    delete: string;
    /** Placeholder {name} = nama pengirim. */
    deleteConfirm: string;
    done: string;
    errorPrefix: string;
  };
  /** Layout admin: navigasi, role, logout (AdminLayout). */
  adminLayout: {
    workspace: string;
    contentGroup: string;
    systemGroup: string;
    accountGroup: string;
    openMenu: string;
    closeMenu: string;
    viewSite: string;
    profile: string;
    signedInAs: string;
    mfaStatus: string;
    mfaEnabled: string;
    mfaUnknown: string;
    accountSettings: string;
    categories: string;
    navDashboard: string;
    navViewProjects: string;
    navAddProjects: string;
    navWriteups: string;
    navViewCertificates: string;
    navAddCertificates: string;
    navMessages: string;
    navSettings: string;
    navExperiences: string;
    navSocialLinks: string;
    navCv: string;
    navBackup: string;
    logout: string;
    role: string;
  };
  /** Halaman list project (admin/projects) — FASE 2. */
  adminProjects: {
    eyebrow: string;
    title: string;
    addNew: string;
    formTitleNew: string;
    formTitleEdit: string;
    backToList: string;
  };
  /** Halaman list certificate (admin/certificates) — FASE 2. */
  adminCertificates: {
    eyebrow: string;
    title: string;
    addNew: string;
    formTitleNew: string;
    formTitleEdit: string;
    backToList: string;
    /** Sumber file: radio upload vs Google Drive. */
    fileSourceTitle: string;
    fileSourceUpload: string;
    fileSourceDrive: string;
    driveUrlLabel: string;
    driveUrlHint: string;
    dateHelper: string;
  };
  notFound: {
    title: string;
    message: string;
    backHome: string;
  };
  errorPages: {
    forbidden: {
      title: string;
      message: string;
      backHome: string;
      backDashboard: string;
    };
    tooManyRequests: {
      title: string;
      message: string;
      backHome: string;
    };
    serverError: {
      title: string;
      message: string;
      backHome: string;
    };
  };
  meta: {
    home: string;
    projects: string;
    certificates: string;
    about: string;
    contact: string;
    projectDetail: string;
  };
}
