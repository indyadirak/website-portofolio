/// <reference types="astro/client" />

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database, Profile } from "./lib/types";

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  namespace App {
    interface Locals {
      /** Server client dengan cookie session (dari middleware). */
      supabase: SupabaseClient<Database>;
      /** User yang terautentikasi, atau null. */
      user: User | null;
      /** Baris public.profiles milik user (untuk cek RBAC), atau null. */
      profile: Profile | null;
    }
  }
}

export {};
