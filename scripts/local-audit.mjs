#!/usr/bin/env node

/**
 * Local red-team smoke audit.
 * Run while `npm run dev` is serving http://localhost:4321.
 * This script performs safe unauthenticated requests only; it does not
 * attempt credential guessing, destructive mutations, or rate-limit abuse.
 */

const BASE_URL = (process.env.AUDIT_BASE_URL ?? "http://localhost:4321").replace(/\/$/, "");
const STRICT_HEADERS = process.env.AUDIT_STRICT_HEADERS === "1";
const REQUIRE_AUTH_REJECTION = process.env.AUDIT_REQUIRE_SUPABASE === "1";
const failures = [];
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures.push(`${name}: ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"} ${name} - ${detail}`);
}

async function request(path, options = {}) {
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      ...options,
    });
    const body = await response.text();
    return { response, body };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkHeaders() {
  const result = await request("/");
  if (result.error) return record("security headers", false, result.error);

  const headers = result.response.headers;
  const required = [
    ["content-security-policy", true],
    ["strict-transport-security", true],
    ["x-frame-options", /deny/i],
    ["cross-origin-embedder-policy", /^credentialless$/i],
  ];
  const missing = required
    .filter(([name, expected]) => {
      const value = headers.get(name);
      return !value || (expected instanceof RegExp ? !expected.test(value) : false);
    })
    .map(([name]) => name);
  const csp = headers.get("content-security-policy") ?? "";
  const unsafe = /unsafe-(?:inline|eval)/i.test(csp);
  const unsafeFailure = STRICT_HEADERS && unsafe;
  const detail = missing.length || unsafe
    ? `missing or invalid: ${missing.join(", ") || "none"}${unsafe ? `; CSP unsafe directive is ${STRICT_HEADERS ? "not allowed in strict mode" : "expected in dev mode"}` : ""}`
    : "CSP, HSTS, X-Frame-Options, and COEP credentialless are present";
  record("security headers", missing.length === 0 && !unsafeFailure, detail);
}

async function checkPublicApiLeaks() {
  for (const path of ["/api/projects", "/api/writeups"]) {
    const result = await request(path);
    if (result.error) {
      record(`public API ${path}`, false, result.error);
      continue;
    }
    const status = result.response.status;
    const body = result.body.toLowerCase();
    const unexpectedSuccess = status >= 200 && status < 300;
    const draftLeak = /\"status\"\s*:\s*\"draft\"|\"is_published\"\s*:\s*false/.test(body);
    record(
      `public API ${path}`,
      !unexpectedSuccess && !draftLeak,
      unexpectedSuccess
        ? `unexpected ${status}; endpoint may expose an unauthenticated collection`
        : draftLeak
          ? "response contains draft markers"
          : `safe response status ${status} (expected 404 or 405 for non-public GET)`,
    );
  }
}

async function checkUnauthenticatedAdmin() {
  const cases = [
    ["PUT", "/api/admin/site-settings?key=about_bio", { value: "audit-probe" }],
    ["POST", "/api/projects", { title: "audit-probe" }],
    ["DELETE", "/api/admin/messages?id=00000000-0000-0000-0000-000000000000", undefined],
  ];
  for (const [method, path, payload] of cases) {
    const result = await request(path, {
      method,
      headers: payload ? { "content-type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    if (result.error) {
      record(`unauthenticated ${method} ${path}`, false, result.error);
      continue;
    }
    const status = result.response.status;
    const authRejected = status === 401 || status === 403;
    const configurationBlocked = status === 503;
    record(
      `unauthenticated ${method} ${path}`,
      authRejected || (configurationBlocked && !REQUIRE_AUTH_REJECTION),
      authRejected
        ? `received HTTP ${status}; auth guard rejected request`
        : configurationBlocked
          ? "received HTTP 503 before auth guard because Supabase is not configured locally; set AUDIT_REQUIRE_SUPABASE=1 for strict auth testing"
          : `received HTTP ${status}; expected 401 or 403`,
    );
  }
}

async function checkPublicRoutes() {
  for (const path of ["/", "/about", "/projects", "/contact"]) {
    const result = await request(path);
    if (result.error) {
      record(`public route ${path}`, false, result.error);
      continue;
    }
    record(`public route ${path}`, result.response.status === 200, `received HTTP ${result.response.status}`);
  }
}

await checkHeaders();
await checkPublicApiLeaks();
await checkUnauthenticatedAdmin();
await checkPublicRoutes();

console.log(`\n${results.filter((item) => item.ok).length}/${results.length} checks passed`);
if (failures.length > 0) {
  console.error("\nAudit failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}
