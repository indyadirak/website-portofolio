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
    rows: string[];
  };
  home: {
    featuredEyebrow: string;
    featuredTitle: string;
    featuredDescription: string;
    viewAllProjects: string;
    skillsEyebrow: string;
    skillsTitle: string;
    skillsDescription: string;
  };
  skills: {
    all: string;
    empty: string;
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
    /** Baris perintah terminal pada empty state utuh. */
    lsLine: string;
    /** Baris "total 0" — jumlah item kosong pada empty state utuh. */
    totalZero: string;
    verify: string;
    featured: string;
    /** Template badge masa berlaku — placeholder {date} diganti format locale. */
    validUntil: string;
    expired: string;
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
    revealEmail: string;
    orVia: string;
    note: string;
    captchaRequired: string;
    captchaUnavailable: string;
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
  security: {
    eyebrow: string;
    title: string;
    lastUpdated: string;
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
      disclosureTitle: string;
      disclosure: string[];
    };
  };
  securityArch: {
    eyebrow: string;
    title: string;
    description: string;
    lastUpdated: string;
    diagramTitle: string;
    diagram: string[];
    postureTitle: string;
    posture: string[];
    disclosureTitle: string;
    disclosureIntro: string;
    scopeTitle: string;
    scope: string[];
    outOfScopeTitle: string;
    outOfScope: string[];
    safeHarborTitle: string;
    safeHarbor: string[];
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
  };
  /** FASE 2: Admin — edit identitas situs (site_settings). */
  adminSettings: {
    eyebrow: string;
    title: string;
    description: string;
    heroTitle: string;
    heroTagline: string;
    shortBio: string;
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
    url: string;
    icon: string;
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
