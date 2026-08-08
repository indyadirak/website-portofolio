export const siteConfig = {
  name: "CyberSec",
  tagline: "Cyber Security Portfolio",
  description:
    "Portfolio Cyber Security — penetration testing, security research, dan blue team defense.",
  url: "https://example.com",
  author: {
    name: "Your Name",
    role: "Cyber Security Specialist",
    email: "hello@example.com",
  },
  navLinks: [
    { label: "Home", href: "/" },
    { label: "Projects", href: "/projects" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ] as const,
  socials: {
    github: "https://github.com/your-username",
    linkedin: "https://linkedin.com/in/your-username",
    twitter: "https://twitter.com/your-username",
  } as const,
} as const;

export type SiteConfig = typeof siteConfig;
