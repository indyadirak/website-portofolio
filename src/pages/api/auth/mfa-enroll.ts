import type { APIContext } from "astro";
import QRCode from "qrcode";
import { getSupabaseFromLocals, json } from "../../../lib/api";

export const prerender = false;

/**
 * MFA Enrollment (first login admin/editor):
 * supabase.auth.mfa.enroll({ factorType: 'totp', issuer, friendlyName })
 * -> faktor baru (unverified) + QR code TOTP (otpauth://) + secret manual.
 * Issuer dikirim eksplisit ("portofolio.indyadirak.my.id") agar label di
 * aplikasi authenticator rapi — tanpa ini server memakai host default
 * (pernah terlihat sebagai "localhost:3000").
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

    // A failed retry can leave an unverified factor behind. Remove only those
    // stale factors so a retry creates one clean enrollment flow, while never
    // touching an already verified authenticator.
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) {
      console.error("[api/auth/mfa-enroll] list factors failed:", factorsError.message);
      return json({ ok: false, error: "enroll_gagal" }, 502);
    }
    for (const factor of factors?.totp ?? []) {
      // auth-js currently types listed TOTP factors as verified only, but the
      // API can still return a pending factor during a failed enrollment.
      if ((factor as { status?: string }).status === "unverified") {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (unenrollError) {
          console.error("[api/auth/mfa-enroll] stale factor cleanup failed:", unenrollError.message);
          return json({ ok: false, error: "enroll_gagal" }, 502);
        }
      }
    }

    // Issuer eksplisit agar aplikasi authenticator menampilkan nama brand
    // yang rapi ("portofolio.indyadirak.my.id"), bukan host default server
    // (mis. "localhost:3000"). friendlyName = email untuk identifikasi
    // faktor di dashboard Supabase. User lama yang sudah enroll dengan
    // issuer lama TIDAK perlu enroll ulang — entry lama tetap valid, hanya
    // labelnya yang kurang rapi (hapus faktor lama + enroll ulang bila
    // ingin label baru).
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      issuer: "portofolio.indyadirak.my.id",
      friendlyName: user.email ?? "CyberSec Admin",
    });

    if (error || !data.totp) {
      return json({ ok: false, error: "enroll_gagal" }, 400);
    }

    // Supabase versions differ: qr_code may already be a data image, while
    // newer responses expose the original otpauth URI separately.
    const providerQrCode = data.totp.qr_code;
    const otpauthUrl = data.totp.uri ??
      (providerQrCode?.startsWith("otpauth://") ? providerQrCode : "");
    const qrDataUrl = providerQrCode?.startsWith("data:image/")
      ? providerQrCode
      : otpauthUrl
        ? await QRCode.toDataURL(otpauthUrl, {
            width: 256,
            margin: 1,
            errorCorrectionLevel: "M",
          })
        : "";

    if (!qrDataUrl || !otpauthUrl) {
      console.error("[api/auth/mfa-enroll] Supabase returned an invalid TOTP QR payload");
      return json({ ok: false, error: "enroll_gagal" }, 502);
    }

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
