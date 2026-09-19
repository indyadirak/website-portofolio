import type { APIContext } from "astro";
import { getSupabaseFromLocals, isAal2Session, json } from "../../../lib/api";
import { canManageCertificates } from "../../../lib/auth";
import { adminMutationGuard } from "../../../lib/rateLimit";
import { WRITEUP_STATUSES, type WriteupSeverity, type WriteupStatus, type WriteupsRow } from "../../../lib/types";

export const prerender = false;

const SEVERITIES: WriteupSeverity[] = ["Critical", "High", "Med", "Low"];

/** Normalisasi slug: lowercase, spasi -> "-", buang karakter non-alfanumerik. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Genapkan slug unik: cek keberadaan di DB, tambah suffix -2, -3, ... */
async function ensureUniqueSlug(
  supabase: NonNullable<ReturnType<typeof getSupabaseFromLocals>>,
  base: string,
  excludeId: string | null
): Promise<string> {
  let slug = base;
  let attempt = 1;
  for (;;) {
    let query = supabase.from("writeups").select("id").eq("slug", slug);
    if (excludeId) query = query.neq("id", excludeId);
    const { data } = await query.maybeSingle();
    if (!data) return slug;
    attempt += 1;
    slug = `${base}-${attempt}`;
  }
}

interface WriteupInput {
  title?: unknown;
  slug?: unknown;
  targetEnv?: unknown;
  methodology?: unknown;
  severity?: unknown;
  findings?: unknown;
  remediation?: unknown;
  status?: unknown;
}

function parseBody(body: WriteupInput) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const targetEnv = typeof body.targetEnv === "string" ? body.targetEnv.trim() : "";
  const methodology = typeof body.methodology === "string" ? body.methodology.trim() : "";
  const severity = typeof body.severity === "string" ? body.severity : "";
  const findings = typeof body.findings === "string" ? body.findings.trim() : "";
  const remediation = typeof body.remediation === "string" ? body.remediation.trim() : "";
  const status = typeof body.status === "string" ? body.status : "published";
  const requestedSlug =
    typeof body.slug === "string" && body.slug.trim() ? slugify(body.slug) : "";

  if (title.length < 3 || title.length > 200) return { error: "title_invalid" } as const;
  if (targetEnv.length < 2 || targetEnv.length > 120) return { error: "target_env_invalid" } as const;
  if (methodology.length < 2 || methodology.length > 120) {
    return { error: "methodology_invalid" } as const;
  }
  if (!SEVERITIES.includes(severity as WriteupSeverity)) {
    return { error: "severity_invalid" } as const;
  }
  if (!(WRITEUP_STATUSES as readonly string[]).includes(status)) {
    return { error: "status_invalid" } as const;
  }
  if (findings.length < 10 || findings.length > 50000) {
    return { error: "findings_invalid" } as const;
  }
  if (remediation.length < 10 || remediation.length > 50000) {
    return { error: "remediation_invalid" } as const;
  }

  return {
    error: null,
    title,
    requestedSlug,
    targetEnv,
    methodology,
    severity,
    findings,
    remediation,
    status: status as WriteupStatus,
  };
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
  if (!canManageCertificates(profile)) {
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

/** Daftar semua write-up (termasuk draft) — urut terbaru. */
export async function GET({ locals }: APIContext) {
  const g = await guard(getSupabaseFromLocals(locals), locals);
  if (g.error) return g.error;

  const { data, error } = await g.supabase
    .from("writeups")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin/writeups] GET gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  return json({ ok: true, writeups: data as unknown as WriteupsRow[] });
}

/** Buat write-up baru. */
export async function POST({ request, locals }: APIContext) {
  const g = await guard(getSupabaseFromLocals(locals), locals, true);
  if (g.error) return g.error;

  let body: WriteupInput;
  try {
    body = (await request.json()) as WriteupInput;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = parseBody(body);
  if (parsed.error) return json({ ok: false, error: parsed.error }, 400);

  const slug = parsed.requestedSlug || slugify(parsed.title);
  const uniqueSlug = await ensureUniqueSlug(g.supabase, slug, null);

  const { data, error } = await g.supabase
    .from("writeups")
    .insert({
      title: parsed.title,
      slug: uniqueSlug,
      target_env: parsed.targetEnv,
      methodology: parsed.methodology,
      severity: parsed.severity as WriteupSeverity,
      findings: parsed.findings,
      remediation: parsed.remediation,
       status: parsed.status,
      created_by: g.user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[admin/writeups] INSERT gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  return json({ ok: true, id: data.id, slug: data.slug }, 200);
}

/** Perbarui write-up (id via query param `?id=`). */
export async function PUT({ request, locals }: APIContext) {
  const g = await guard(getSupabaseFromLocals(locals), locals, true);
  if (g.error) return g.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_wajib_ada" }, 400);

  let body: WriteupInput;
  try {
    body = (await request.json()) as WriteupInput;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  // ===== Jalur parsial: toggle publish (dari tabel admin) =====
  // Body hanya berisi status tanpa field lain -> update satu kolom,
  // tanpa validasi panjang field. Body penuh tetap divalidasi ketat.
  if (typeof body.title === "undefined") {
    if (typeof body.status !== "string" || !(WRITEUP_STATUSES as readonly string[]).includes(body.status)) {
      return json({ ok: false, error: "status_invalid" }, 400);
    }
    const { data, error } = await g.supabase
      .from("writeups")
      .update({ status: body.status as WriteupStatus, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .single();

    if (error) {
      console.error("[admin/writeups] UPDATE publish gagal:", error.message);
      return json({ ok: false, error: "db_operation_failed" }, 403);
    }
    return json({ ok: true, id: data.id }, 200);
  }

  const parsed = parseBody(body);
  if (parsed.error) return json({ ok: false, error: parsed.error }, 400);

  const slug = parsed.requestedSlug || slugify(parsed.title);
  const uniqueSlug = await ensureUniqueSlug(g.supabase, slug, id);

  const { data, error } = await g.supabase
    .from("writeups")
    .update({
      title: parsed.title,
      slug: uniqueSlug,
      target_env: parsed.targetEnv,
      methodology: parsed.methodology,
      severity: parsed.severity as WriteupSeverity,
      findings: parsed.findings,
      remediation: parsed.remediation,
       status: parsed.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[admin/writeups] UPDATE gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  return json({ ok: true, id: data.id, slug: data.slug }, 200);
}

/** Hapus write-up (id via query param `?id=`). */
export async function DELETE({ request, locals }: APIContext) {
  const g = await guard(getSupabaseFromLocals(locals), locals, true);
  if (g.error) return g.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ ok: false, error: "id_wajib_ada" }, 400);

  const { error } = await g.supabase.from("writeups").delete().eq("id", id);
  if (error) {
    console.error("[admin/writeups] DELETE gagal:", error.message);
    return json({ ok: false, error: "db_operation_failed" }, 403);
  }

  return json({ ok: true }, 200);
}
