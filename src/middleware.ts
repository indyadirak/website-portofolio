import { defineMiddleware } from "astro:middleware";
import {
  ADMIN_BASE,
  ADMIN_DASHBOARD,
  ADMIN_LOGIN,
  createServerSupabase,
  getUserProfile,
  isSupabaseConfigured,
} from "./lib/auth";

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;

  // Skip auth check untuk aset statis & favicon.
  if (path.startsWith("/_astro/") || path === "/favicon.svg" || path === "/favicon.ico") {
    return next();
  }

  if (!isSupabaseConfigured) {
    // Halaman login tetap dirender (menampilkan pesan), sisanya dialihkan.
    if (path.startsWith(ADMIN_BASE) && path !== ADMIN_LOGIN) {
      return context.redirect(ADMIN_LOGIN + "?error=supabase_not_configured");
    }
    return next();
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
  if (path.startsWith(ADMIN_BASE)) {
    if (path === ADMIN_BASE) {
      return user
        ? context.redirect(ADMIN_DASHBOARD)
        : context.redirect(ADMIN_LOGIN);
    }

    // Halaman admin selain login wajib punya sesi valid.
    if (path !== ADMIN_LOGIN && !user) {
      const nextPath = path === ADMIN_DASHBOARD ? "" : `?next=${encodeURIComponent(path)}`;
      return context.redirect(`${ADMIN_LOGIN}${nextPath}`);
    }
  }

  return next();
});
