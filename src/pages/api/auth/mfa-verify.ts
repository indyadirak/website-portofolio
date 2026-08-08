import type { APIContext } from "astro";
import { getSupabaseFromLocals, json } from "../../../lib/api";
import { persistMfaSession } from "../../../lib/auth";

export const prerender = false;

interface VerifyBody {
  factorId?: string;
  code?: string;
}

/**
 * Langkah 2 (MFA login): mfa.challenge -> mfa.verify.
 * Sesuai spesifikasi: `(select auth.jwt() ->> 'aal') = 'aal2'` baru bernilai
 * benar setelah faktor kedua diverifikasi; sesi aal2 disimpan ke cookie.
 */
export async function POST({ request, locals }: APIContext) {
  const supabase = getSupabaseFromLocals(locals);

  if (!supabase) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }

  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const factorId = body.factorId;
  const code = body.code;

  if (!factorId || !code || !/^\d{6}$/.test(code)) {
    return json({ ok: false, error: "kode_wajib_6_digit" }, 400);
  }

  const { data: challenge, error: challengeError } =
    await supabase.auth.mfa.challenge({ factorId });

  if (challengeError || !challenge) {
    return json({ ok: false, error: "mfa_challenge_gagal" }, 400);
  }

  const { data: verified, error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });

  if (verifyError || !verified.access_token) {
    return json({ ok: false, error: "kode_mfa_tidak_valid" }, 401);
  }

  // Sesi penuh (aal2) — simpan ke cookie.
  await persistMfaSession(supabase, verified);

  return json({ ok: true, step: "done" });
}
