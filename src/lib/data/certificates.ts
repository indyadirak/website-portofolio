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
    credentialId: row.credential_id,
    credentialUrl: row.credential_url,
    skills: row.skills,
    description: row.description,
    fileUrl: row.file_url,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Kategori sertifikat yang tersedia (dipakai untuk filter UI). */
export const certificateCategories: Array<CertificateCategory | "all"> = [
  "all",
  "compliance",
  "training",
];

/** Mengambil semua sertifikat dari Supabase (fallback: demo data). */
export async function getCertificates(): Promise<Certificate[]> {
  const supabase = getSupabase();
  if (!supabase) return demoCertificates;

  const { data, error } = await supabase
    .from("certificates")
    .select("*")
    .order("issue_date", { ascending: false });

  if (error) {
    console.error("[supabase] Gagal mengambil certificates:", error.message);
    return demoCertificates;
  }

  return (data ?? []).map(toCertificate);
}

export type { CertificateCategory };