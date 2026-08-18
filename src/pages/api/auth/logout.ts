import type { APIContext } from "astro";
import { getSupabaseFromLocals, json } from "../../../lib/api";

export const prerender = false;

export async function POST({ locals }: APIContext) {
  const supabase = getSupabaseFromLocals(locals);

  if (!supabase) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("[auth/logout] signOut gagal:", error.message);
    return json({ ok: false, error: "signout_failed" }, 500);
  }

  return json({ ok: true });
}
