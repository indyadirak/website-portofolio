import type { APIContext } from "astro";
import QRCode from "qrcode";
import { getSupabaseFromLocals, json } from "../../../lib/api";

export const prerender = false;

/**
 * MFA Enrollment (first login admin/editor):
 * supabase.auth.mfa.enroll({ factorType: 'totp' }) -> faktor baru (unverified)
 * + QR code TOTP (otpauth://) + secret manual.
 *
 * Error handling: seluruh body handler dibungkus try/catch — kegagalan
 * apapun (Supabase timeout, QRCode render, exception tak terduga) mengembalikan
 * 500 JSON, TIDAK pernah hang/menggantung tanpa respons.
 */
export async function POST({ locals }: APIContext) {
  try {
    const supabase = getSupabaseFromLocals(locals);

    if (!supabase) {
      return json({ ok: false, error: "supabase_not_configured" }, 503);
    }

    const { user } = locals;

    if (!user) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
    });

    if (error || !data.totp) {
      return json({ ok: false, error: "enroll_gagal" }, 400);
    }

    const otpauthUrl = data.totp.qr_code;
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
      width: 256,
      margin: 1,
      errorCorrectionLevel: "M",
    });

    return json({
      ok: true,
      factorId: data.id,
      qrDataUrl,
      otpauthUrl,
      secret: data.totp.secret,
    });
  } catch (err) {
    console.error("[api/auth/mfa-enroll] exception:", err);
    return json({ ok: false, error: "enroll_gagal" }, 500);
  }
}
