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
  delete(key: string): Promise<void>;
}

interface Env {
  /** KV namespace untuk rate limiting (lihat wrangler.toml / dashboard). */
  RATE_LIMIT_KV: KvNamespaceLike;
  /**
   * Secret runtime Turnstile — `npx wrangler secret put TURNSTILE_SECRET_KEY`.
   * Optional karena belum tentu ter-set (misal sebelum deploy pertama);
   * TIDAK di-bake ke bundle build (lihat src/lib/config.ts).
   */
  TURNSTILE_SECRET_KEY?: string;
  /**
   * URL Supabase (sama dengan PUBLIC_SUPABASE_URL). Runtime secret yang
   * di-set deploy.yml dari secrets.PUBLIC_SUPABASE_URL — dipakai endpoint
   * /api/backup-config (PostgREST, service role) untuk baca konfigurasi
   * backup Drive saat workflow GitHub mengeksekusi backup mingguan.
   */
  SUPABASE_URL?: string;
  /**
   * service_role key Supabase — runtime secret, TIDAK pernah di-bundle.
   * Hanya dipakai server-side (endpoint /api/backup-config yang di-gate
   * BACKUP_FETCH_TOKEN). Set via deploy.yml dari secrets.SUPABASE_SERVICE_ROLE_KEY.
   */
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /**
   * Token acak untuk memanggil /api/backup-config dari GitHub Actions.
   * Nilai sama di dua tempat: secrets.BACKUP_FETCH_TOKEN (GitHub) dan
   * worker secret BACKUP_FETCH_TOKEN (deploy.yml).
   */
  BACKUP_FETCH_TOKEN?: string;
  /**
   * Kunci AES-256-GCM untuk enkripsi-at-rest JSON key Service Account
   * Drive sebelum disimpan ke public.backup_config. Set via deploy.yml
   * dari secrets.GDRIVE_CONFIG_ENCRYPTION_SECRET.
   */
  GDRIVE_CONFIG_ENCRYPTION_SECRET?: string;
  /**
   * PAT GitHub (fine-grained, Actions: read+write pada repo ini) untuk
   * memicu workflow_dispatch "Deploy to Cloudflare Workers" dari Worker
   * saat ada perubahan konten CMS (lihat src/lib/deploy.ts).
   * Dinamai CMS_DEPLOY_TOKEN karena GitHub melarang prefix GITHUB_ untuk
   * Actions secrets. TIDAK pernah dikembalikan ke klien. Set via
   * deploy.yml dari secrets.CMS_DEPLOY_TOKEN.
   */
  CMS_DEPLOY_TOKEN?: string;
  /**
   * Nama repo "owner/name" untuk dispatch deploy. Opsional — default
   * "indyadirak/website-portofolio" bila tidak di-set.
   */
  GITHUB_REPO?: string;
}

declare module "cloudflare:workers" {
  export const env: Env;
}
