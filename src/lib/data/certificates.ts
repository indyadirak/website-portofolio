import type { Certificate, CertificateCategory, CertificatesRow } from "../types";
import { getSupabase } from "../supabase";
import { demoCertificates } from "./demo";

/** Konversi row database -> tipe domain (snake_case -> camelCase). */
function toCertificate(row: CertificatesRow): Certificate {
  return {
    id: row.id,
    title: row.title,
    issuer: row.issuer,
    issueDate: row.issue_date,
    expiryDate: row.expiry_date,
    category: row.category,
    isFeatured: row.is_featured,
    shortDescriptionId: row.short_description_id,
    shortDescriptionEn: row.short_description_en,
    credentialId: row.credential_id,
    credentialUrl: row.credential_url,
    verificationUrl: row.verification_url,
    skills: row.skills,
    description: row.description,
    fileUrl: row.file_url,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Mengambil semua sertifikat dari Supabase (fallback: demo data). */
export async function getCertificates(): Promise<Certificate[]> {
  const supabase = getSupabase();
  if (!supabase) return demoCertificates;

  // Featured dulu, lalu terbitan terbaru — sertifikat unggulan selalu di atas.
  const { data, error } = await supabase
    .from("certificates")
    .select("*")
    .order("is_featured", { ascending: false })
    .order("issue_date", { ascending: false });

  if (error) {
    console.error("[supabase] Gagal mengambil certificates:", error.message);
    return demoCertificates;
  }

  return (data ?? []).map(toCertificate);
}

/** Kategori sertifikat yang tersedia (dipakai untuk filter UI). */
export const certificateCategories: Array<CertificateCategory | "all"> = [
  "all",
  "compliance",
  "training",
];

export type { CertificateCategory };