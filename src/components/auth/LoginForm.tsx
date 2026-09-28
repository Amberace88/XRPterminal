"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Mail, Timer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Misc";
import { Tabs } from "@/components/ui/Tabs";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { OAuthButtons } from "./OAuthButtons";
import { safeNextPath, type OAuthProvider } from "./providers";
import { authErrorMessage, reportAuthEvent, useAttemptLimiter } from "./useAttemptLimiter";

export function FormAlert({ tone = "danger", children }: { tone?: "danger" | "success" | "info"; children: React.ReactNode }) {
  const cls =
    tone === "success" ? "border-success/30 bg-success/[0.07] text-success" : tone === "info" ? "border-info/30 bg-info/[0.07] text-info" : "border-danger/30 bg-danger/[0.07] text-danger";
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-lg border px-3 py-2.5 text-sm ${cls}`}>
      {children}
    </div>
  );
}

export function LockNotice({ seconds }: { seconds: number }) {
  return (
    <FormAlert tone="info">
      <span className="inline-flex items-center gap-2">
        <Timer className="h-4 w-4" /> Too many attempts. You can try again in <span className="num font-semibold">{seconds}s</span>.
      </span>
    </FormAlert>
  );
}

export function LoginForm({ providers }: { providers: OAuthProvider[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const limiter = useAttemptLimiter("login");

  useEffect(() => {
    const e = params.get("error");
    if (e) setError(e.slice(0, 200));
  }, [params]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseBrowser();
    if (!sb || limiter.locked) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    setUnconfirmed(false);
    try {
      if (mode === "password") {
        const { error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (err) {
          const m = authErrorMessage(err);
          setError(m.message);
          setUnconfirmed(/verify your email/i.test(m.message));
          limiter.fail(m.rateLimited ? 60 : undefined);
          return;
        }
        limiter.succeed();
        await reportAuthEvent("login", "password");
        router.replace(next);
        router.refresh();
      } else {
        const { error: err } = await sb.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (err) {
          const m = authErrorMessage(err);
          // Don't reveal whether an account exists for this email.
          if (m.rateLimited) {
            setError(m.message);
            limiter.fail(60);
            return;
          }
        }
        setInfo("If an account exists for this email, a sign-in link is on its way. It expires shortly — check your inbox and spam folder.");
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    await sb.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` } });
    setInfo("If this email is awaiting verification, we've sent a new confirmation link.");
    setUnconfirmed(false);
  };

  return (
    <div className="space-y-5">
      <OAuthButtons providers={providers} next={next} onError={(m) => setError(m)} />
      <Tabs
        ariaLabel="Sign-in method"
        value={mode}
        onChange={(v) => {
          setMode(v);
          setError(null);
          setInfo(null);
        }}
        items={[
          { value: "password", label: "Password" },
          { value: "magic", label: "Email link" },
        ]}
        className="w-full [&>button]:flex-1"
      />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="login-email">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
            <input id="login-email" type="email" autoComplete="email" required className="input pl-9" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </Field>
        {mode === "password" && (
          <Field
            label={
              <span className="flex w-full items-center justify-between">
                Password
                <Link href="/forgot-password" className="text-2xs font-normal text-accent-strong hover:underline">
                  Forgot password?
                </Link>
              </span>
            }
            htmlFor="login-password"
          >
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                className="input pl-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </Field>
        )}
        {limiter.locked && <LockNotice seconds={limiter.remainingSec} />}
        {error && !limiter.locked && (
          <FormAlert>
            {error}
            {unconfirmed && (
              <button type="button" onClick={resend} className="ml-1 underline">
                Resend confirmation
              </button>
            )}
          </FormAlert>
        )}
        {info && <FormAlert tone="success">{info}</FormAlert>}
        {!limiter.locked && limiter.attemptsLeft <= 2 && mode === "password" && (
          <p className="text-2xs text-fg-muted">
            {limiter.attemptsLeft} attempt{limiter.attemptsLeft === 1 ? "" : "s"} left before a short cooldown.
          </p>
        )}
        <Button type="submit" className="w-full" loading={busy} disabled={!email || (mode === "password" && !password) || limiter.locked}>
          {mode === "password" ? "Sign in" : "Email me a sign-in link"}
        </Button>
      </form>
    </div>
  );
}
