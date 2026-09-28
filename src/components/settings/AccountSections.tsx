"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, BadgeCheck, CreditCard, ExternalLink, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field, CopyButton } from "@/components/ui/Misc";
import { Skeleton } from "@/components/ui/States";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { useApi, apiPost, ApiError } from "@/hooks/useApi";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { clearAllLocal } from "@/lib/storage/local";
import { formatDate, formatDateTime } from "@/lib/format";
import { planOf } from "@/lib/entitlements";
import { PasswordMeter } from "@/components/auth/SignupForm";
import { FormAlert } from "@/components/auth/LoginForm";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { passwordStrength } from "@/components/auth/providers";
import { authErrorMessage, reportAuthEvent } from "@/components/auth/useAttemptLimiter";
import { GuestNotice, SettingRow, SettingsSection } from "./SettingsSection";

/* ------------------------------------------------------------------ Account */
export function AccountSection() {
  const { enabled, user, profile, plan, loading, refreshProfile } = useAuth();
  const toast = useToast();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setName(profile?.display_name ?? ""), [profile?.display_name]);

  const save = async () => {
    const sb = getSupabaseBrowser();
    if (!sb || !user) return;
    setSaving(true);
    const { error } = await sb.from("profiles").update({ display_name: name.trim().slice(0, 60) || null }).eq("id", user.id);
    setSaving(false);
    if (error) toast({ title: "Could not save", description: error.message, tone: "danger" });
    else {
      toast({ title: "Profile updated", tone: "success" });
      void refreshProfile();
    }
  };

  return (
    <SettingsSection id="account" title="Account" description="Your identity and plan. Guest mode works without an account.">
      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : !user ? (
        <div className="space-y-3">
          <GuestNotice>
            <strong className="text-fg">Guest mode</strong> — your settings, wallets, alerts and paper trades are stored in this browser only. Clearing site data removes
            them. {enabled ? "Create a free account to sync across devices." : "Accounts are not enabled on this deployment yet."}
          </GuestNotice>
          {enabled && (
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/signup" size="sm">
                Create free account
              </ButtonLink>
              <ButtonLink href="/login?next=/settings" size="sm" variant="secondary">
                Sign in
              </ButtonLink>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          <SettingRow label="Email" description={user.email_confirmed_at ? "Verified" : "Not yet verified — check your inbox"}>
            <span className="inline-flex items-center gap-1.5 text-sm text-fg">
              {user.email}
              {user.email_confirmed_at && <BadgeCheck className="h-4 w-4 text-success" aria-label="Verified" />}
            </span>
          </SettingRow>
          <SettingRow label="Display name" description="Shown on your public social profile if you make it visible.">
            <div className="flex gap-2">
              <input className="input h-9 w-48" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Display name" />
              <Button size="sm" variant="secondary" loading={saving} onClick={save} disabled={name === (profile?.display_name ?? "")}>
                Save
              </Button>
            </div>
          </SettingRow>
          <SettingRow label="Plan">
            <span className="flex items-center gap-2">
              <Badge tone={plan === "free" ? "neutral" : "accent"}>{planOf(plan).name}</Badge>
              <Link href="#billing" className="text-xs text-accent-strong hover:underline">
                Billing
              </Link>
            </span>
          </SettingRow>
          <SettingRow label="Member since">
            <span className="num text-sm text-fg-secondary">{formatDate(user.created_at)}</span>
          </SettingRow>
          <ReferralRow />
          <div className="pt-3">
            <SignOutButton />
          </div>
        </div>
      )}
    </SettingsSection>
  );
}

function ReferralRow() {
  const { data, loading, error } = useApi<{ code: string | null; clicks: number; uniqueClicks: number; signups: number; paid: number }>("/api/referral", { staleMs: 60_000 });
  const link = data?.code && typeof window !== "undefined" ? `${window.location.origin}/?ref=${data.code}` : null;
  return (
    <SettingRow
      label="Referral link"
      description={data ? `${data.uniqueClicks} unique clicks · ${data.signups} signups · ${data.paid} paid — counted from real, verified events only.` : "Share XRP Terminal with others."}
    >
      {loading && !data ? (
        <Skeleton className="h-8 w-56" />
      ) : error ? (
        <span className="text-xs text-fg-muted">Unavailable</span>
      ) : link ? (
        <span className="flex items-center gap-1 rounded-lg border border-border-subtle bg-bg-secondary px-2 py-1 font-mono text-xs text-fg-secondary">
          <span className="max-w-[220px] truncate">{link}</span>
          <CopyButton value={link} label="Copy referral link" />
        </span>
      ) : (
        <span className="text-xs text-fg-muted">Not available</span>
      )}
    </SettingRow>
  );
}

/* ------------------------------------------------------------------ Security */
export function SecuritySection() {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const valid = passwordStrength(pw).unmet.length === 0 && pw === confirm;

  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseBrowser();
    if (!sb || !valid) return;
    setBusy(true);
    setError(null);
    const { error: err } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    if (err) return setError(authErrorMessage(err).message);
    await reportAuthEvent("password_changed");
    setPw("");
    setConfirm("");
    toast({ title: "Password changed", description: "We've added a security notice to your notifications.", tone: "success" });
  };

  const signOutAll = async () => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setRevoking(true);
    await reportAuthEvent("sessions_revoked");
    await sb.auth.signOut({ scope: "global" });
    setRevoking(false);
    router.replace("/login");
  };

  return (
    <SettingsSection id="security" title="Security" description="Password, sessions and sign-in protection.">
      {!user ? (
        <GuestNotice>Security settings apply to accounts. In guest mode nothing is stored on our servers. Remember: never share a seed phrase or private key — XRP Terminal will never ask for one.</GuestNotice>
      ) : (
        <div className="space-y-5">
          <form onSubmit={change} className="grid gap-3 sm:max-w-md" noValidate>
            <p className="text-sm font-medium text-fg">Change password</p>
            <Field label="New password" htmlFor="sec-pw">
              <input id="sec-pw" type="password" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            <PasswordMeter password={pw} />
            <Field label="Confirm new password" htmlFor="sec-confirm" error={confirm && confirm !== pw ? "Passwords don't match" : null}>
              <input id="sec-confirm" type="password" autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            {error && <FormAlert>{error}</FormAlert>}
            <div>
              <Button type="submit" size="sm" loading={busy} disabled={!valid}>
                Update password
              </Button>
            </div>
          </form>
          <div className="space-y-1 border-t border-border-subtle pt-4">
            <SettingRow label="Last sign-in" description="Sign-ins from a new browser or device create a security notification.">
              <span className="num text-sm text-fg-secondary">{user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : "—"}</span>
            </SettingRow>
            <SettingRow label="Sign out everywhere" description="Ends every active session on all devices, including this one.">
              <Button size="sm" variant="outline" loading={revoking} onClick={signOutAll}>
                <LogOut className="h-3.5 w-3.5" /> Sign out all sessions
              </Button>
            </SettingRow>
            <SettingRow label="Two-factor authentication" description="On the roadmap. The account system is prepared for it; it is not available yet.">
              <Badge tone="neutral">Planned</Badge>
            </SettingRow>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ Billing */
export function BillingSection() {
  const { enabled, user, profile, plan, refreshProfile } = useAuth();
  const params = useSearchParams();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const success = params.get("billing") === "success";
  const refreshRef = useRef(refreshProfile);
  refreshRef.current = refreshProfile;
  const userId = user?.id;

  useEffect(() => {
    if (!success || !userId) return;
    // The webhook usually lands within seconds; refresh the profile a few times.
    const ids = [2000, 6000, 15000].map((ms) => setTimeout(() => void refreshRef.current(), ms));
    return () => ids.forEach(clearTimeout);
  }, [success, userId]);

  const portal = async () => {
    setBusy(true);
    try {
      const r = await apiPost<{ url: string }>("/api/billing/portal", {});
      window.location.assign(r.url);
    } catch (e) {
      setBusy(false);
      toast({ title: "Billing portal unavailable", description: e instanceof ApiError ? e.message : "Please try again.", tone: "warning" });
    }
  };

  const def = planOf(plan);
  return (
    <SettingsSection id="billing" title="Billing" description="Subscriptions are handled by Stripe. We never see your full card details.">
      {success && (
        <div className="mb-4">
          <FormAlert tone="success">Payment received. Your plan updates as soon as Stripe confirms the subscription — usually within a few seconds.</FormAlert>
        </div>
      )}
      {!user ? (
        <GuestNotice>
          {enabled ? (
            <>
              Paid plans require an account.{" "}
              <Link href="/signup" className="text-accent-strong hover:underline">
                Create one
              </Link>{" "}
              or{" "}
              <Link href="/pricing" className="text-accent-strong hover:underline">
                compare plans
              </Link>
              .
            </>
          ) : (
            <>Billing is not enabled on this deployment. Every Free feature works in guest mode.</>
          )}
        </GuestNotice>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent">
              <CreditCard className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-fg">
                {def.name} plan <span className="num text-fg-muted">· €{def.priceEurMonthly.toFixed(2)}/month</span>
              </p>
              <p className="text-xs text-fg-muted">
                Status: {profile?.subscription_status ?? (plan === "free" ? "no subscription" : "unknown")}
                {profile?.subscription_status === "past_due" && <span className="ml-1 text-warning">— payment failed, update your payment method</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/pricing" size="sm" variant={plan === "free" ? "primary" : "secondary"}>
              {plan === "free" ? "Upgrade" : "Compare plans"}
            </ButtonLink>
            {(plan !== "free" || profile?.subscription_status) && (
              <Button size="sm" variant="secondary" loading={busy} onClick={portal}>
                Manage billing <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ Delete account */
export function DeleteAccountSection() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (confirm !== "DELETE") return;
    setBusy(true);
    setError(null);
    if (!user) {
      clearAllLocal();
      toast({ title: "Browser data deleted", description: "All XRP Terminal data in this browser was removed.", tone: "success" });
      setTimeout(() => window.location.assign("/"), 600);
      return;
    }
    try {
      await apiPost("/api/user/delete", { confirm: "DELETE" });
      await signOut().catch(() => undefined);
      clearAllLocal();
      router.replace("/?account=deleted");
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Deletion failed. Please try again.");
    }
  };

  return (
    <SettingsSection
      id="delete"
      tone="danger"
      title={user ? "Delete account" : "Delete browser data"}
      description={user ? "Permanently delete your account and personal data." : "Remove every XRP Terminal setting and guest-mode record from this browser."}
    >
      <div className="space-y-4">
        <ul className="space-y-1.5 text-xs leading-relaxed text-fg-secondary">
          {user ? (
            <>
              <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" /> Any active subscription is cancelled immediately — no further charges and no refund of the current period unless required by law.</li>
              <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" /> Your profile, tracked wallets, exchange connections, alerts, watchlists, paper-trading history, journal and strategies are permanently deleted.</li>
              <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-muted" /> We keep only records the law requires (billing records, anonymised audit entries).</li>
              <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-muted" /> This cannot be undone. Export your data first if you want a copy.</li>
            </>
          ) : (
            <>
              <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" /> Removes preferences, tracked wallets, alerts, watchlists, paper trades and journal stored in this browser.</li>
              <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-muted" /> Nothing is stored on our servers in guest mode, so there is nothing else to delete.</li>
            </>
          )}
        </ul>
        <Field label={<>Type <span className="font-mono font-semibold text-danger">DELETE</span> to confirm</>} htmlFor="del-confirm">
          <input id="del-confirm" className="input max-w-xs font-mono" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" spellCheck={false} />
        </Field>
        {error && <FormAlert>{error}</FormAlert>}
        <Button variant="danger" size="sm" disabled={confirm !== "DELETE"} loading={busy} onClick={run}>
          <Trash2 className="h-3.5 w-3.5" /> {user ? "Delete my account" : "Delete browser data"}
        </Button>
      </div>
    </SettingsSection>
  );
}
