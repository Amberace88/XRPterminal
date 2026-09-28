"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, KeyRound, Mail, MailCheck } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field } from "@/components/ui/Misc";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { getStoredReferral } from "@/components/marketing/ReferralCapture";
import { trackEvent } from "@/components/marketing/track";
import { readPlatformSettings, syncPlatformSettingsToProfile, writePlatformSettings, type InterestId } from "@/components/settings/platformSettings";
import { InterestsPicker } from "./InterestsPicker";
import { OAuthButtons } from "./OAuthButtons";
import { FormAlert, LockNotice } from "./LoginForm";
import { passwordStrength, type OAuthProvider } from "./providers";
import { authErrorMessage, reportAuthEvent, useAttemptLimiter } from "./useAttemptLimiter";

const STRENGTH = ["Too weak", "Weak", "Fair", "Good", "Strong"];

export function PasswordMeter({ password }: { password: string }) {
  const { score, unmet } = passwordStrength(password);
  if (!password) return null;
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="grid grid-cols-4 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1 rounded-full", i <= score ? (score <= 1 ? "bg-danger" : score === 2 ? "bg-warning" : "bg-success") : "bg-surface-hover")} />
        ))}
      </div>
      <p className="text-2xs text-fg-muted">
        {STRENGTH[score]}
        {unmet.length > 0 && <> · Needs: {unmet.join(", ").toLowerCase()}</>}
      </p>
    </div>
  );
}

type Step = "account" | "interests" | "verify";

export function SignupForm({ providers }: { providers: OAuthProvider[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const plan = params.get("plan");
  const [step, setStep] = useState<Step>("account");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [referral, setReferral] = useState("");
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interests, setInterests] = useState<InterestId[]>([]);
  const [session, setSession] = useState<{ userId: string } | null>(null);
  const limiter = useAttemptLimiter("signup", 5, 30 * 60_000);

  useEffect(() => {
    const r = getStoredReferral();
    if (r) setReferral(r);
    setInterests(readPlatformSettings().interests);
  }, []);

  const pw = passwordStrength(password);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && pw.unmet.length === 0 && password === confirm && accept;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseBrowser();
    if (!sb || !valid || limiter.locked) return;
    setBusy(true);
    setError(null);
    try {
      const ref = referral.trim().toLowerCase();
      const { data, error: err } = await sb.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
          data: /^[a-z0-9-]{4,32}$/.test(ref) ? { referral_code: ref } : {},
        },
      });
      if (err) {
        const m = authErrorMessage(err);
        setError(m.message);
        limiter.fail(m.rateLimited ? 60 : undefined);
        return;
      }
      limiter.succeed();
      trackEvent("signup");
      if (data.session && data.user) {
        setSession({ userId: data.user.id });
        await reportAuthEvent("login", "password");
      }
      setStep("interests");
    } finally {
      setBusy(false);
    }
  };

  const saveInterests = async () => {
    const s = { ...readPlatformSettings(), interests };
    writePlatformSettings(s);
    if (session) {
      await syncPlatformSettingsToProfile(session.userId, s);
      router.replace("/dashboard");
      return;
    }
    setStep("verify");
  };

  if (step === "interests") {
    return (
      <div className="space-y-5">
        <div>
          <p className="text-sm font-medium text-fg">What are you most interested in?</p>
          <p className="mt-1 text-xs text-fg-muted">We use this to set up your dashboard. You can change it any time in Settings.</p>
        </div>
        <InterestsPicker value={interests} onChange={setInterests} />
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => (session ? router.replace("/dashboard") : setStep("verify"))}>
            Skip
          </Button>
          <Button className="flex-1" onClick={saveInterests}>
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (step === "verify") {
    return (
      <div className="space-y-5 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-accent">
          <MailCheck className="h-6 w-6" />
        </span>
        <div>
          <p className="text-base font-semibold text-fg">Verify your email</p>
          <p className="mt-1.5 text-sm text-fg-secondary">
            We sent a confirmation link to <span className="font-medium text-fg">{email.trim()}</span>. Open it to activate your account. If you already had an
            account, sign in instead.
          </p>
        </div>
        {plan === "pro" || plan === "proplus" ? (
          <FormAlert tone="info">After verifying, choose your plan on the pricing page to start the subscription.</FormAlert>
        ) : null}
        <div className="grid gap-2">
          <ButtonLink href="/dashboard" variant="secondary">
            Explore the terminal while you wait
          </ButtonLink>
          <ButtonLink href="/login" variant="ghost">
            Back to sign in
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <OAuthButtons providers={providers} next="/dashboard" onError={(m) => setError(m)} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="su-email">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
            <input id="su-email" type="email" autoComplete="email" required className="input pl-9" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </Field>
        <Field label="Password" htmlFor="su-password">
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
            <input id="su-password" type="password" autoComplete="new-password" required className="input pl-9" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </Field>
        <PasswordMeter password={password} />
        <Field label="Confirm password" htmlFor="su-confirm" error={confirm && confirm !== password ? "Passwords don't match" : null}>
          <input id="su-confirm" type="password" autoComplete="new-password" required className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Field label="Referral code (optional)" htmlFor="su-ref">
          <input id="su-ref" className="input" value={referral} maxLength={32} onChange={(e) => setReferral(e.target.value)} />
        </Field>
        <label className="flex items-start gap-2.5 text-xs leading-relaxed text-fg-secondary">
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-border accent-[rgb(var(--accent))]" />
          <span>
            I am 18 or older and agree to the{" "}
            <Link href="/legal/terms" className="text-accent-strong hover:underline">
              Terms of Service
            </Link>{" "}
            and have read the{" "}
            <Link href="/legal/privacy" className="text-accent-strong hover:underline">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/legal/risk" className="text-accent-strong hover:underline">
              Risk Disclosure
            </Link>
            .
          </span>
        </label>
        {limiter.locked && <LockNotice seconds={limiter.remainingSec} />}
        {error && !limiter.locked && <FormAlert>{error}</FormAlert>}
        <Button type="submit" className="w-full" loading={busy} disabled={!valid || limiter.locked}>
          Create account
        </Button>
        <p className="text-center text-2xs text-fg-muted">We&apos;ll email you a link to verify your address.</p>
      </form>
    </div>
  );
}
