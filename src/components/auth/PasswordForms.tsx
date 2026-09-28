"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Misc";
import { Skeleton } from "@/components/ui/States";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { FormAlert, LockNotice } from "./LoginForm";
import { PasswordMeter } from "./SignupForm";
import { passwordStrength } from "./providers";
import { authErrorMessage, reportAuthEvent, useAttemptLimiter } from "./useAttemptLimiter";

/** Request a password reset email. Always responds identically (no account enumeration). */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const limiter = useAttemptLimiter("forgot", 3, 15 * 60_000);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseBrowser();
    if (!sb || limiter.locked) return;
    setBusy(true);
    setError(null);
    const { error: err } = await sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (err && authErrorMessage(err).rateLimited) {
      setError(authErrorMessage(err).message);
      limiter.fail(60);
      return;
    }
    limiter.fail(); // counts requests, not failures — throttles reset-mail spam
    setSent(true);
  };

  if (sent)
    return (
      <div className="space-y-4">
        <FormAlert tone="success">If an account exists for {email.trim()}, a password reset link is on its way. The link expires shortly.</FormAlert>
        <Link href="/login" className="block text-center text-sm text-accent-strong hover:underline">
          Back to sign in
        </Link>
      </div>
    );

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Email" htmlFor="fp-email">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
          <input id="fp-email" type="email" autoComplete="email" required className="input pl-9" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </Field>
      {limiter.locked && <LockNotice seconds={limiter.remainingSec} />}
      {error && !limiter.locked && <FormAlert>{error}</FormAlert>}
      <Button type="submit" className="w-full" loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim()) || limiter.locked}>
        Send reset link
      </Button>
    </form>
  );
}

/** Set a new password. Requires the recovery session established by /auth/callback. */
export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "missing">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return setReady("missing");
    sb.auth.getSession().then(({ data }) => setReady(data.session ? "ok" : "missing"));
  }, []);

  const valid = passwordStrength(password).unmet.length === 0 && password === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseBrowser();
    if (!sb || !valid) return;
    setBusy(true);
    setError(null);
    const { error: err } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(authErrorMessage(err).message);
    await reportAuthEvent("password_changed");
    setDone(true);
    setTimeout(() => router.replace("/dashboard"), 1500);
  };

  if (ready === "checking") return <Skeleton className="h-40 w-full" />;
  if (ready === "missing")
    return (
      <div className="space-y-4">
        <FormAlert>This reset link is invalid or has expired. Request a new one to continue.</FormAlert>
        <Link href="/forgot-password" className="block text-center text-sm text-accent-strong hover:underline">
          Request a new link
        </Link>
      </div>
    );
  if (done) return <FormAlert tone="success">Password updated. Taking you to your dashboard…</FormAlert>;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="New password" htmlFor="rp-password">
        <input id="rp-password" type="password" autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <PasswordMeter password={password} />
      <Field label="Confirm new password" htmlFor="rp-confirm" error={confirm && confirm !== password ? "Passwords don't match" : null}>
        <input id="rp-confirm" type="password" autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {error && <FormAlert>{error}</FormAlert>}
      <Button type="submit" className="w-full" loading={busy} disabled={!valid}>
        Update password
      </Button>
    </form>
  );
}
