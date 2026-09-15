import type { Writeup, WriteupsRow } from "../types";
import { getSupabase } from "../supabase";
import { demoWriteups } from "./demo";

/**
 * Data layer publik untuk tabel public.writeups (CMS CTF).
 * Hanya menampilkan write-up dengan is_published = true (RLS juga
 * memblokir draft di level database — filter di sini berlapis).
 */

/** Konversi row database -> tipe domain (snake_case -> camelCase). */
function toWriteup(row: WriteupsRow): Writeup {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    targetEnv: row.target_env,
    methodology: row.methodology,
    severity: row.severity,
    findings: row.findings,
    remediation: row.remediation,
    status: row.status,
    isPublished: row.is_published,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Semua write-up yang diterbitkan, terbaru dulu (fallback: demo data). */
export async function getWriteups(): Promise<Writeup[]> {
  const supabase = getSupabase();
  if (!supabase) return demoWriteups;

  const { data, error } = await supabase
    .from("writeups")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[supabase] Gagal mengambil writeups:", error.message);
    return [];
  }

  return (data ?? []).map(toWriteup);
}

/** Satu write-up berdasarkan slug (hanya yang diterbitkan; fallback: demo). */
export async function getWriteupBySlug(slug: string): Promise<Writeup | null> {
  const supabase = getSupabase();
  if (!supabase) return demoWriteups.find((writeup) => writeup.slug === slug) ?? null;

  const { data, error } = await supabase
    .from("writeups")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    console.error("[supabase] Gagal mengambil writeup:", error.message);
    return null;
  }

  return data ? toWriteup(data) : null;
}
