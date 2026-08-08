import { getSupabase } from "../supabase";
import type { Database } from "../types";

export interface ContactInput {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface ContactResult {
  ok: boolean;
  error?: string;
}

/**
 * Menyimpan pesan kontak ke tabel `contact_messages`.
 * Membutuhkan Supabase terkonfigurasi + policy RLS `INSERT` (lihat supabase/schema.sql).
 */
export async function submitContactMessage(input: ContactInput): Promise<ContactResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Supabase belum dikonfigurasi. Salin .env.example ke .env terlebih dahulu." };
  }

  const { error } = await supabase.from("contact_messages").insert({
    name: input.name.trim(),
    email: input.email.trim(),
    subject: input.subject.trim(),
    message: input.message.trim(),
  });

  if (error) {
    console.error("[supabase] Gagal menyimpan pesan:", error.message);
    return { ok: false, error: "Gagal mengirim pesan. Coba lagi nanti." };
  }

  return { ok: true };
}

export type { Database };
