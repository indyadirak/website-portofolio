/**
 * Tipe data domain (hasil parsing) dan tipe database (Supabase row).
 * Seluruh tipe bersifat readonly-aware dan strict.
 */

// ---------------------------------------------------------------------------
// Domain types (dipakai oleh pages & components)
// ---------------------------------------------------------------------------

export type ProjectCategory = "Web App" | "Mobile" | "Network" | "IoT" | "Red Team" | "Blue Team" | "Defensive" | "OSINT" | "Forensics";

export type ProjectStatus = "active" | "archived" | "planned";

export interface Project {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  category: ProjectCategory;
  tags: string[];
  imageUrl: string | null;
  repoUrl: string | null;
  liveUrl: string | null;
  featured: boolean;
  status: ProjectStatus;
  createdAt: string;
}

export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
  level: SkillLevel;
  icon: string | null;
}

export type SkillCategory = "Offensive" | "Defensive" | "Tools" | "Programming" | "Soft Skill";

export type SkillLevel = "beginner" | "intermediate" | "advanced" | "expert";

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
}

export interface SocialLinks {
  github: string;
  linkedin: string;
  twitter: string;
}

/** Role RBAC pada tabel public.profiles. */
export type UserRole = "admin" | "editor" | "viewer";

/** Sertifikat (tabel public.certificates) — domain type. */
export interface Certificate {
  id: string;
  title: string;
  issuer: string;
  issueDate: string;
  expiryDate: string | null;
  credentialId: string | null;
  credentialUrl: string | null;
  skills: string[];
  description: string | null;
  fileUrl: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
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

// ---------------------------------------------------------------------------
// Supabase database types (untuk type-safe query: supabase-js)
// ---------------------------------------------------------------------------

export type ProjectsRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  category: ProjectCategory;
  tags: string[];
  image_url: string | null;
  repo_url: string | null;
  live_url: string | null;
  featured: boolean;
  status: ProjectStatus;
  created_at: string;
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
  subject: string;
  message: string;
  created_at: string;
};

export type CertificatesRow = {
  id: string;
  title: string;
  issuer: string;
  issue_date: string;
  expiry_date: string | null;
  credential_id: string | null;
  credential_url: string | null;
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
          category?: ProjectCategory;
          tags?: string[];
          image_url?: string | null;
          repo_url?: string | null;
          live_url?: string | null;
          featured?: boolean;
          status?: ProjectStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          title?: string;
          summary?: string;
          description?: string;
          category?: ProjectCategory;
          tags?: string[];
          image_url?: string | null;
          repo_url?: string | null;
          live_url?: string | null;
          featured?: boolean;
          status?: ProjectStatus;
          created_at?: string;
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
          subject: string;
          message: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          subject?: string;
          message?: string;
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
          credential_id?: string | null;
          credential_url?: string | null;
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
          credential_id?: string | null;
          credential_url?: string | null;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
