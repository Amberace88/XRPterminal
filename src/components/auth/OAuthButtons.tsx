"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { PROVIDER_LABEL, type OAuthProvider } from "./providers";

/** OAuth sign-in (only providers configured via NEXT_PUBLIC_AUTH_PROVIDERS are rendered). */
export function OAuthButtons({ providers, next, onError }: { providers: OAuthProvider[]; next: string; onError: (msg: string) => void }) {
  const [pending, setPending] = useState<OAuthProvider | null>(null);
  if (!providers.length) return null;
  const go = async (provider: OAuthProvider) => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setPending(provider);
    const { error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setPending(null);
      onError(error.message);
    }
  };
  return (
    <div className="space-y-2">
      {providers.map((p) => (
        <Button key={p} type="button" variant="secondary" className="w-full" loading={pending === p} onClick={() => go(p)}>
          {pending !== p && <Globe className="h-4 w-4" />} Continue with {PROVIDER_LABEL[p]}
        </Button>
      ))}
      <div className="flex items-center gap-3 py-2 text-2xs uppercase tracking-wider text-fg-muted">
        <span className="h-px flex-1 bg-border-subtle" /> or <span className="h-px flex-1 bg-border-subtle" />
      </div>
    </div>
  );
}
