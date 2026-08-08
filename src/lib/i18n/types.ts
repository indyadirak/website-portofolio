/**
 * Kamus terjemahan UI — diketik ketat agar key yang hilang terdeteksi
 * saat compile. Tambahkan key baru di ketiga file (types, id, en).
 */
export interface Dictionary {
  langName: string;
  nav: {
    home: string;
    projects: string;
    about: string;
    contact: string;
    downloadCv: string;
    menu: string;
  };
  hero: {
    eyebrow: string;
    role: string;
    tagline: string;
    description: string;
    viewProjects: string;
    contactMe: string;
    downloadCv: string;
    statusOpen: string;
    statusClosed: string;
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
  };
  footer: {
    rights: string;
    github: string;
    linkedin: string;
  };
  notFound: {
    title: string;
    message: string;
    backHome: string;
  };
  meta: {
    home: string;
    projects: string;
    about: string;
    contact: string;
    projectDetail: string;
  };
}
