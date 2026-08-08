/**
 * Deklarasi ambient (tanpa import/export agar bukan module) untuk binding
 * runtime Cloudflare workerd. Dipakai via:
 *   import { env } from "cloudflare:workers";
 *
 * Struktural typing minimal — real KVNamespace di workerd memenuhi antarmuka
 * ini (menghindari ketergantungan ke @cloudflare/workers-types di tsconfig).
 */
interface KvNamespaceLike {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void>;
}

interface Env {
  /** KV namespace untuk rate limiting (lihat wrangler.toml / dashboard Pages). */
  RATE_LIMIT_KV: KvNamespaceLike;
}

declare module "cloudflare:workers" {
  export const env: Env;
}
