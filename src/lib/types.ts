/**
 * Tipe data domain (hasil parsing) dan tipe database (Supabase row).
 * Seluruh tipe bersifat readonly-aware dan strict.
 */

// ---------------------------------------------------------------------------
// Domain types (dipakai oleh pages & components)
// ---------------------------------------------------------------------------

export type ProjectCategory = "Web App" | "Mobile" | "Network" | "IoT" | "Red Team" | "Blue Team" | "Defensive" | "OSINT" | "Forensics" | "Cloud Security" | "Malware Analysis" | "Active Directory" | "Security Automation" | "Incident Response";

/**
 * Nilai status project — SINGLE SOURCE OF TRUTH (dipakai API + form admin).
 * Harus identik dengan CHECK constraint kolom status di supabase/schema.sql
 * (`status in ('active','archived','planned')`).
 */
export const PROJECT_STATUSES = ["active", "archived", "planned"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface Project {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  /** Nama kategori tampilan (COALESCE pc.name, p.category). */
  category: string;
  /** FK ke project_categories (B2) — null = legacy text fallback. */
  categoryId: string | null;
  tags: string[];
  imageUrl: string | null;
  repoUrl: string | null;
  liveUrl: string | null;
  featured: boolean;
  status: ProjectStatus;
  /** Struktur "Problem / Approach / Impact" — nullable untuk project lama. */
  problem: string | null;
  solution: string | null;
  impact: string | null;
  createdAt: string;
}

export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
  level: SkillLevel;
  icon: string | null;
}

export type SkillCategory = "Offensive" | "Defensive" | "Tools" | "Programming" | "Soft Skill" | "Network" | "Forensics";

export type SkillLevel = "beginner" | "intermediate" | "advanced" | "expert";

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  /** true = sudah ditandai dibaca di admin (FASE 2). */
  isRead: boolean;
  createdAt: string;
}

export interface SocialLinks {
  github: string;
  linkedin: string;
  twitter: string;
}

/** Role RBAC pada tabel public.profiles. */
export type UserRole = "admin" | "editor" | "viewer";

/** Kategori sertifikat: kepatuhan (standar) vs pelatihan (kursus/workshop). */
export type CertificateCategory = "compliance" | "training";

/** Sertifikat (tabel public.certificates) — domain type. */
export interface Certificate {
  id: string;
  title: string;
  issuer: string;
  issueDate: string;
  expiryDate: string | null;
  category: CertificateCategory;
  /** Sertifikat unggulan — badge "Featured" + diurutkan paling atas. */
  isFeatured: boolean;
  /** Keterangan singkat per bahasa (opsional, maks 150 karakter). */
  shortDescriptionId: string | null;
  shortDescriptionEn: string | null;
  credentialId: string | null;
  credentialUrl: string | null;
  /** URL halaman verifikasi resmi issuer (misal badge Credly). Null = tidak ada. */
  verificationUrl: string | null;
  skills: string[];
  description: string | null;
  fileUrl: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Tautan sosial dinamis (tabel public.social_links) — domain type. */
export interface SocialLink {
  id: string;
  platform: string;
  url: string;
  icon: string | null;
  sortOrder: number;
  createdAt: string;
}

/** Pengalaman karir (tabel public.experiences) — domain type (camelCase). */
export interface Experience {
  id: string;
  role: string;
  company: string;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  description: string;
  sortOrder: number;
}

/** Profil user (tabel public.profiles, id → auth.users.id). */
export interface Profile {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  mfaEnforced: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Severity laporan write-up — dipakai untuk badge warna di UI. */
export type WriteupSeverity = "Critical" | "High" | "Med" | "Low";

export const WRITEUP_STATUSES = ["draft", "published"] as const;
export type WriteupStatus = (typeof WRITEUP_STATUSES)[number];

/** Write-up CTF (tabel public.writeups) — format terstruktur THM/HTB. */
export interface Writeup {
  id: string;
  title: string;
  slug: string;
  /** Nama lab/mesin target (mis. "HTB Machine X"). */
  targetEnv: string;
  /** Kerangka kerja (mis. OWASP / MITRE ATT&CK). */
  methodology: string;
  severity: WriteupSeverity;
  findings: string;
  remediation: string;
  status: WriteupStatus;
  isPublished: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Supabase database types (untuk type-safe query: supabase-js)
// ---------------------------------------------------------------------------

export type ProjectsRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  /** FK ke project_categories (B2) — nullable: fallback ke kolom category text. */
  category_id: string | null;
  tags: string[];
  image_url: string | null;
  repo_url: string | null;
  live_url: string | null;
  featured: boolean;
  status: ProjectStatus;
  problem: string | null;
  solution: string | null;
  impact: string | null;
  created_at: string;
};

/** Kategori proyek dinamis (tabel public.project_categories) — B2. */
export type ProjectCategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Nilai yang diizinkan untuk key site_settings.availability_status. */
export type AvailabilityStatus = "open-to-work" | "not-available";

/** Kunci identitas dinamis (tabel public.site_settings) — FASE 2. */
export const SITE_SETTING_KEYS = [
  "hero_title",
  "hero_tagline",
  "short_bio",
  "availability_status",
] as const;
export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[number];

/** Baris tabel public.site_settings — identitas utama (key/value). */
export type SiteSettingRow = {
  id: string;
  key: SiteSettingKey;
  value: string;
  created_at: string;
  updated_at: string;
};

/** Baris tabel public.experiences — Career Timeline (FASE 2). */
export type ExperienceRow = {
  id: string;
  role: string;
  company: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  description: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** Baris tabel public.social_links — tautan sosial dinamis (FASE 2). */
export type SocialLinkRow = {
  id: string;
  platform: string;
  url: string;
  icon: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type SkillsRow = {
  id: string;
  name: string;
  category: SkillCategory;
  level: SkillLevel;
  icon: string | null;
};

export type ContactMessagesRow = {
  id: string;
  name: string;
  email: string;
  message: string;
  /** Penanda dibaca (admin/editor) — false = belum dibaca (FASE 2). */
  is_read: boolean;
  created_at: string;
};

export type CertificatesRow = {
  id: string;
  title: string;
  issuer: string;
  issue_date: string;
  expiry_date: string | null;
  category: CertificateCategory;
  is_featured: boolean;
  short_description_id: string | null;
  short_description_en: string | null;
  credential_id: string | null;
  credential_url: string | null;
  verification_url: string | null;
  skills: string[];
  description: string | null;
  file_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfilesRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  mfa_enforced: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Baris tabel public.backup_config (single-row, id = 1).
 * `gdrive_service_account_key` berisi ciphertext AES-256-GCM
 * ("enc:<iv>:<tag>:<ct>" base64) — plaintext hanya dalam bentuk itu.
 */
export type BackupConfigRow = {
  id: number;
  gdrive_service_account_key: string | null;
  gdrive_folder_id: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

/** Baris tabel public.cv_files — metadata file CV per bahasa (id | en). */
export type CvFilesRow = {
  locale: "id" | "en";
  file_path: string;
  file_name: string;
  size_bytes: number;
  mime: string;
  uploaded_by: string | null;
  updated_at: string;
};

/** Baris tabel public.writeups — CMS laporan CTF terstruktur. */
export type WriteupsRow = {
  id: string;
  title: string;
  slug: string;
  target_env: string;
  methodology: string;
  severity: WriteupSeverity;
  findings: string;
  remediation: string;
  status: WriteupStatus;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: ProjectsRow;
        Insert: {
          id?: string;
          slug: string;
          title: string;
          summary: string;
          description?: string;
          category?: string;
          category_id?: string | null;
          tags?: string[];
          image_url?: string | null;
          repo_url?: string | null;
          live_url?: string | null;
          featured?: boolean;
          status?: ProjectStatus;
          problem?: string | null;
          solution?: string | null;
          impact?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          title?: string;
          summary?: string;
          description?: string;
          category?: string;
          category_id?: string | null;
          tags?: string[];
          image_url?: string | null;
          repo_url?: string | null;
          live_url?: string | null;
          featured?: boolean;
          status?: ProjectStatus;
          problem?: string | null;
          solution?: string | null;
          impact?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "project_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      project_categories: {
        Row: ProjectCategoryRow;
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      skills: {
        Row: SkillsRow;
        Insert: {
          id?: string;
          name: string;
          category?: SkillCategory;
          level?: SkillLevel;
          icon?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          category?: SkillCategory;
          level?: SkillLevel;
          icon?: string | null;
        };
        Relationships: [];
      };
      contact_messages: {
        Row: ContactMessagesRow;
        Insert: {
          id?: string;
          name: string;
          email: string;
          message: string;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          message?: string;
          is_read?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      certificates: {
        Row: CertificatesRow;
        Insert: {
          id?: string;
          title: string;
          issuer: string;
          issue_date: string;
          expiry_date?: string | null;
          category?: CertificateCategory;
          is_featured?: boolean;
          short_description_id?: string | null;
          short_description_en?: string | null;
          credential_id?: string | null;
          credential_url?: string | null;
          verification_url?: string | null;
          skills?: string[];
          description?: string | null;
          file_url?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          issuer?: string;
          issue_date?: string;
          expiry_date?: string | null;
          category?: CertificateCategory;
          is_featured?: boolean;
          short_description_id?: string | null;
          short_description_en?: string | null;
          credential_id?: string | null;
          credential_url?: string | null;
          verification_url?: string | null;
          skills?: string[];
          description?: string | null;
          file_url?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: ProfilesRow;
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          mfa_enforced?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          mfa_enforced?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      backup_config: {
        Row: BackupConfigRow;
        Insert: {
          id: number;
          gdrive_service_account_key?: string | null;
          gdrive_folder_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: number;
          gdrive_service_account_key?: string | null;
          gdrive_folder_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      cv_files: {
        Row: CvFilesRow;
        Insert: {
          locale: "id" | "en";
          file_path: string;
          file_name: string;
          size_bytes: number;
          mime: string;
          uploaded_by?: string | null;
          updated_at?: string;
        };
        Update: {
          locale?: "id" | "en";
          file_path?: string;
          file_name?: string;
          size_bytes?: number;
          mime?: string;
          uploaded_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      writeups: {
        Row: WriteupsRow;
        Insert: {
          id?: string;
          title: string;
          slug: string;
          target_env: string;
          methodology: string;
          severity?: WriteupSeverity;
          findings: string;
          remediation: string;
          status?: WriteupStatus;
          is_published?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          slug?: string;
          target_env?: string;
          methodology?: string;
          severity?: WriteupSeverity;
          findings?: string;
          remediation?: string;
          status?: WriteupStatus;
          is_published?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      site_settings: {
        Row: SiteSettingRow;
        Insert: {
          id?: string;
          key: SiteSettingKey;
          value: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: SiteSettingKey;
          value?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      experiences: {
        Row: ExperienceRow;
        Insert: {
          id?: string;
          role: string;
          company: string;
          start_date: string;
          end_date?: string | null;
          is_current?: boolean;
          description?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: string;
          company?: string;
          start_date?: string;
          end_date?: string | null;
          is_current?: boolean;
          description?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      social_links: {
        Row: SocialLinkRow;
        Insert: {
          id?: string;
          platform: string;
          url: string;
          icon?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          platform?: string;
          url?: string;
          icon?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
