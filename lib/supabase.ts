import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// May be null if env vars are not set (build-time prerender, or misconfigured deploy)
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;
