import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { isSupabaseConfigured, publicEnv } from "@/lib/config";

/** Cookie-bound server client (acts as the signed-in user; RLS applies). Null if not configured. */
export async function getSupabaseServer(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* called from a Server Component — middleware refreshes sessions */
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses RLS — only for trusted server jobs (cron, webhooks,
 * admin actions after role verification). Never expose to the browser.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isSupabaseConfigured() || !key) return null;
  return createClient(publicEnv.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getCurrentUser(): Promise<User | null> {
  const sb = await getSupabaseServer();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

export type Role = "user" | "admin";

/** Server-side role check (spec §259: never trust a frontend admin flag). */
export async function getCurrentRole(): Promise<{ user: User | null; role: Role; plan: string }> {
  const sb = await getSupabaseServer();
  if (!sb) return { user: null, role: "user", plan: "free" };
  const { data } = await sb.auth.getUser();
  const user = data.user ?? null;
  if (!user) return { user: null, role: "user", plan: "free" };
  const { data: profile } = await sb.from("profiles").select("role, plan").eq("id", user.id).maybeSingle();
  return { user, role: (profile?.role as Role) ?? "user", plan: (profile?.plan as string) ?? "free" };
}
