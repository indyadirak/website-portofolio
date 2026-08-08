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
    return json({ ok: false, error: error.message }, 500);
  }

  return json({ ok: true });
}
