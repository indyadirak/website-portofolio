import { defineMiddleware } from "astro:middleware";
import {
  ADMIN_BASE,
  ADMIN_DASHBOARD,
  ADMIN_LOGIN,
  createServerSupabase,
  getUserProfile,
  isSupabaseConfigured,
} from "./lib/auth";

/**
 * ===== Security Headers (SUMBER KEBENARAN untuk response SSR) =====
 *
 * Salinan persis dari public/_headers (fallback untuk aset statis murni
 * yang tidak lewat Worker). Di model Cloudflare Workers, `_headers` TIDAK
 * diterapkan ke response yang dihasilkan Worker code — termasuk semua
 * halaman SSR Astro. Maka di sini header di-set programatik pada SETIAP
 * response (halaman, redirect, error) sebelum dikembalikan.
 *
 * CSP tanpa 'unsafe-inline'/'unsafe-eval': semua script Astro di-build
 * menjadi file eksternal (_astro/*.js). `challenges.cloudflare.com`
 * diizinkan untuk widget Turnstile; `*.supabase.co` untuk data & koneksi.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data: https://*.supabase.co; font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;

  let response: Response;

  // Skip auth check untuk aset statis & favicon.
  if (path.startsWith("/_astro/") || path === "/favicon.svg" || path === "/favicon.ico") {
    response = await next();
  } else if (!isSupabaseConfigured) {
    // Halaman login tetap dirender (menampilkan pesan), sisanya dialihkan.
    response = path.startsWith(ADMIN_BASE) && path !== ADMIN_LOGIN
      ? context.redirect(ADMIN_LOGIN + "?error=supabase_not_configured")
      : await next();
  } else {
    const supabase = createServerSupabase(context.cookies, context.request);

    // Validasi + auto-refresh token sesi (via cookie).
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let profile = null;
    if (user) {
      profile = await getUserProfile(supabase, user.id);
    }

    context.locals.supabase = supabase;
    context.locals.user = user;
    context.locals.profile = profile;

    // ===== Guard route /admin =====
    if (path.startsWith(ADMIN_BASE)) {
      if (path === ADMIN_BASE) {
        response = user
          ? context.redirect(ADMIN_DASHBOARD)
          : context.redirect(ADMIN_LOGIN);
      } else if (path !== ADMIN_LOGIN && !user) {
        // Halaman admin selain login wajib punya sesi valid.
        const nextPath = path === ADMIN_DASHBOARD ? "" : `?next=${encodeURIComponent(path)}`;
        response = context.redirect(`${ADMIN_LOGIN}${nextPath}`);
      } else {
        response = await next();
      }
    } else {
      response = await next();
    }
  }

  // ===== Tempel security headers ke SEMUA response (SSR + redirect + error) =====
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }

  return response;
});
