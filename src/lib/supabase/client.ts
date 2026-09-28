"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, publicEnv } from "@/lib/config";

let browserClient: SupabaseClient | null = null;

/** Returns a browser Supabase client, or null when Supabase is not configured. */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!browserClient) browserClient = createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  return browserClient;
}
