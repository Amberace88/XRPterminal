"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/config";

export interface Profile {
  id: string;
  display_name: string | null;
  plan: "free" | "pro" | "proplus";
  role: "user" | "admin";
  subscription_status: string | null;
}

interface AuthCtx {
  /** Supabase configured for this deployment */
  enabled: boolean;
  loading: boolean;
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /** Guest = no account; data persists in this browser only */
  isGuest: boolean;
  plan: "free" | "pro" | "proplus";
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const enabled = isSupabaseConfigured();
  const [loading, setLoading] = useState(enabled);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = async (uid: string | undefined) => {
    const sb = getSupabaseBrowser();
    if (!sb || !uid) return setProfile(null);
    const { data } = await sb.from("profiles").select("id, display_name, plan, role, subscription_status").eq("id", uid).maybeSingle();
    setProfile((data as Profile) ?? null);
  };

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadProfile(data.session?.user.id).finally(() => setLoading(false));
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      loadProfile(s?.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      enabled,
      loading,
      user: session?.user ?? null,
      session,
      profile,
      isGuest: !session?.user,
      plan: profile?.plan ?? "free",
      signOut: async () => {
        await getSupabaseBrowser()?.auth.signOut();
        setProfile(null);
      },
      refreshProfile: () => loadProfile(session?.user.id),
    }),
    [enabled, loading, session, profile],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
