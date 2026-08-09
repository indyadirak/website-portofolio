import { defineMiddleware } from "astro:middleware";
import {
  ADMIN_BASE,
  ADMIN_DASHBOARD,
  ADMIN_LOGIN,
  createServerSupabase,
  getUserProfile,
  isSupabaseConfigured,
} from "./lib/auth";
import { pageNavigationGuard } from "./lib/rateLimit";

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

/** Halaman admin yang HANYA boleh dibuka role admin (bukan editor/viewer). */
const ADMIN_ONLY_PATHS = ["/admin/backup", "/admin/cv"];

/** IP asli klien — prioritas header Cloudflare, lalu X-Forwarded-For. */
function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function withSecurityHeaders(response: Response): Response {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;

  // Aset statis & favicon: tanpa rate limit/auth check, langsung lanjut.
  if (
    path.startsWith("/_astro/") ||
    path === "/favicon.svg" ||
    path === "/favicon.ico"
  ) {
    return withSecurityHeaders(await next());
  }

  const isApi = path.startsWith("/api/");

  // Halaman error tidak ikut di-rate-limit: rewrite ke /429 yang dilakukan
  // middleware tidak boleh diblokir lagi (mencegah loop rewrite -> 508).
  const isErrorPage = path === "/403" || path === "/429" || path === "/500";

  // ===== Rate limit navigasi halaman HTML =====
  // API endpoint punya guard masing-masing (lebih ketat & fail-closed);
  // halaman HTML dilindungi dari hammering/scraping (fail-open).
  if (!isApi && !isErrorPage) {
    const pageDecision = await pageNavigationGuard.check(clientIp(context.request));
    if (!pageDecision.allowed) {
      return withSecurityHeaders(await context.rewrite("/429"));
    }
  }

  if (!isSupabaseConfigured) {
    // Halaman login tetap dirender (menampilkan pesan), sisanya dialihkan.
    const response =
      path.startsWith(ADMIN_BASE) && path !== ADMIN_LOGIN
        ? context.redirect(ADMIN_LOGIN + "?error=supabase_not_configured")
        : await next();
    return withSecurityHeaders(response);
  }

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
  let response: Response;
  if (path.startsWith(ADMIN_BASE)) {
    if (path === ADMIN_BASE) {
      response = user
        ? context.redirect(ADMIN_DASHBOARD)
        : context.redirect(ADMIN_LOGIN);
    } else if (path !== ADMIN_LOGIN && !user) {
      // Halaman admin selain login wajib punya sesi valid.
      const nextPath = path === ADMIN_DASHBOARD ? "" : `?next=${encodeURIComponent(path)}`;
      response = context.redirect(`${ADMIN_LOGIN}${nextPath}`);
    } else if (ADMIN_ONLY_PATHS.includes(path) && profile?.role !== "admin") {
      // Editor/viewer membuka halaman khusus admin -> halaman 403.
      response = await context.rewrite("/403");
    } else {
      response = await next();
    }
  } else {
    response = await next();
  }

  return withSecurityHeaders(response);
});
