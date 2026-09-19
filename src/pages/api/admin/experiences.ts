import type { APIContext } from "astro";
import { getSupabaseFromLocals, isAal2Session, json } from "../../../lib/api";
import { canDeleteSiteContent, canManageSiteContent } from "../../../lib/auth";
import { adminMutationGuard } from "../../../lib/rateLimit";
import type { ExperienceRow } from "../../../lib/types";
import { isDateRangeValid, normalizeDateInput } from "../../../lib/dates";

export const prerender = false;

interface ExperienceInput {
  role?: unknown;
  company?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  isCurrent?: unknown;
  description?: unknown;
  sortOrder?: unknown;
}

type GuardResult =
  | { error: Response }
  | {
      error: null;
      supabase: NonNullable<ReturnType<typeof getSupabaseFromLocals>>;
      user: NonNullable<App.Locals["user"]>;
    };

/** Guard terpusat: session + role admin/editor + rate limit mutasi. */
async function guard(
  supabase: ReturnType<typeof getSupabaseFromLocals>,
  locals: App.Locals,
  write = false,
): Promise<GuardResult> {
  if (!supabase) return { error: json({ ok: false, error: "supabase_not_configured" }, 503) };
  const { user, profile } = locals;
  if (!user) return { error: json({ ok: false, error: "unauthorized" }, 401) };
  if (!canManageSiteContent(profile)) {
    return { error: json({ ok: false, error: "forbidden_role" }, 403) };
  }
  if (write && !(await isAal2Session(supabase))) {
    return { error: json({ ok: false, error: "mfa_required" }, 403) };
  }
  const decision = await adminMutationGuard.check(user.id);
  if (decision.reason === "kv_unavailable") {
    return { error: json({ ok: false, error: "service_unavailable" }, 503) };
  }
  if (!decision.allowed) {
    return { error: json({ ok: false, error: "too_many_requests" }, 429) };
  }
  return { error: null, supabase, user };
}

/** Guard khusus DELETE: hanya admin (selaras policy RLS delete admin). */
async function guardAdminOnly(
  supabase: ReturnType<typeof getSupabaseFromLocals>,
  locals: App.Locals,
  write = true,
): Promise<GuardResult> {
  if (!supabase) return { error: json({ ok: false, error: "supabase_not_configured" }, 503) };
  const { user, profile } = locals;
  if (!user) return { error: json({ ok: false, error: "unauthorized" }, 401) };
  if (!canDeleteSiteContent(profile)) {
    return { error: json({ ok: false, error: "forbidden_role" }, 403) };
  }
  if (write && !(await isAal2Session(supabase))) {
    return { error: json({ ok: false, error: "mfa_required" }, 403) };
  }
  const decision = await adminMutationGuard.check(user.id);
  if (decision.reason === "kv_unavailable") {
    return { error: json({ ok: false, error: "service_unavailable" }, 503) };
  }
  if (!decision.allowed) {
    return { error: json({ ok: false, error: "too_many_requests" }, 429) };
  }
  return { error: null, supabase, user };
}

/** Validasi field input dari request body. Mengembalikan error string atau null. */
function validate(body: ExperienceInput): {
  error: string | null;
  role: string;
  company: string;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  description: string;
  sortOrder: number;
} {
  const role = typeof body.role === "string" ? body.role.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const rawStartDate = typeof body.startDate === "string" ? body.startDate.trim() : "";
  const rawEndDate = typeof body.endDate === "string" ? body.endDate.trim() : "";
  const isCurrent = body.isCurrent === true;
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const sortOrder = typeof body.sortOrder === "number" ? Math.floor(body.sortOrder) : 0;

  if (!role || role.length > 120) return { error: "role_invalid", role, company, startDate: rawStartDate, endDate: rawEndDate || null, isCurrent, description, sortOrder };
  if (!company || company.length > 120) return { error: "company_invalid", role, company, startDate: rawStartDate, endDate: rawEndDate || null, isCurrent, description, sortOrder };
  const startDate = normalizeDateInput(rawStartDate);
  if (!startDate) return { error: "start_date_invalid", role, company, startDate: rawStartDate, endDate: rawEndDate || null, isCurrent, description, sortOrder };
  let endDate: string | null = null;
  if (isCurrent) return { error: null, role, company, startDate, endDate: null, isCurrent, description, sortOrder };
  if (!rawEndDate) return { error: "end_date_required", role, company, startDate, endDate: null, isCurrent, description, sortOrder };
  endDate = normalizeDateInput(rawEndDate);
  if (!endDate) return { error: "end_date_invalid", role, company, startDate, endDate: null, isCurrent, description, sortOrder };
  if (!isDateRangeValid(startDate, endDate)) return { error: "end_date_before_start", role, company, startDate, endDate, isCurrent, description, sortOrder };
  return { error: null, role, company, startDate, endDate, isCurrent, description, sortOrder };
}

/** Daftar semua pengalaman — urut sort_order, lalu start_date baru dulu. */
export async function GET({ locals }: APIContext) {
  const g = await guard(getSupabaseFromLocals(locals), locals);
  if (g.error) return g.error;

  const { data, error } = await g.supabase
    .from("experiences")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("start_date", { ascending: false });

  if (error) {
    console.error("[admin/experiences] GET gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  return json({ ok: true, experiences: data as unknown as ExperienceRow[] });
}

/** Buat pengalaman baru. */
export async function POST({ request, locals }: APIContext) {
  const g = await guard(getSupabaseFromLocals(locals), locals, true);
  if (g.error) return g.error;

  let body: ExperienceInput;
  try {
    body = (await request.json()) as ExperienceInput;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const v = validate(body);
  if (v.error) return json({ ok: false, error: v.error }, 400);

  const { data, error } = await g.supabase
    .from("experiences")
    .insert({
      role: v.role,
      company: v.company,
      start_date: v.startDate,
      end_date: v.endDate,
      is_current: v.isCurrent,
      description: v.description,
      sort_order: v.sortOrder,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[admin/experiences] INSERT gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  return json({ ok: true, id: data.id }, 200);
}

/** Perbarui pengalaman (id via query param `?id=`). */
export async function PUT({ request, locals }: APIContext) {
  const g = await guard(getSupabaseFromLocals(locals), locals, true);
  if (g.error) return g.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_required" }, 400);

  let body: ExperienceInput;
  try {
    body = (await request.json()) as ExperienceInput;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const v = validate(body);
  if (v.error) return json({ ok: false, error: v.error }, 400);

  const { data, error } = await g.supabase
    .from("experiences")
    .update({
      role: v.role,
      company: v.company,
      start_date: v.startDate,
      end_date: v.endDate,
      is_current: v.isCurrent,
      description: v.description,
      sort_order: v.sortOrder,
    })
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    console.error("[admin/experiences] UPDATE gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  return json({ ok: true, id: data.id }, 200);
}

/** Hapus pengalaman (id via query param `?id=`). DELETE hanya admin. */
export async function DELETE({ request, locals }: APIContext) {
  const g = await guardAdminOnly(getSupabaseFromLocals(locals), locals);
  if (g.error) return g.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_required" }, 400);

  const { error } = await g.supabase.from("experiences").delete().eq("id", id);

  if (error) {
    console.error("[admin/experiences] DELETE gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  return json({ ok: true });
}