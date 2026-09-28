"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Clock, KeyRound, RefreshCw, ShieldCheck, UserCheck } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Switch, CopyButton, Hash } from "@/components/ui/Misc";
import { Badge, TrustBadge } from "@/components/ui/Badge";
import { NotConnected, Skeleton } from "@/components/ui/States";
import { useApi, apiPost, ApiError } from "@/hooks/useApi";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/format";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { normalizeXrplAddress } from "@/lib/xrpl/address";
import { DEFAULT_PRIVACY, PRIVACY_LABELS, type TraderPrivacy } from "@/lib/social/types";

interface Account {
  id: string;
  address: string;
  status: "VERIFIED" | "UNVERIFIED" | "PENDING" | "REVOKED";
  challenge_code: string | null;
  challenge_expires_at: string | null;
  verified_at: string | null;
  verified_tx_hash: string | null;
  last_synced_at: string | null;
}
interface MeResp {
  trader: (Record<string, unknown> & { id: string; display_name: string; bio: string | null; verification_status: string }) | null;
  accounts: Account[];
}
interface ChallengeResp {
  status: string;
  address: string;
  code?: string;
  memoHex?: string;
  expiresAt?: number;
  instructions?: string[];
}

/** "Become a verified trader": on-chain memo challenge (we never sign or see keys) + privacy controls. */
export function VerifyWizard({ className }: { className?: string }) {
  const { enabled, user, loading: authLoading } = useAuth();
  const toast = useToast();
  const { tz } = usePreferences();
  const me = useApi<MeResp>(enabled && user ? "/api/traders/me" : null, { staleMs: 30_000 });
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [challenge, setChallenge] = useState<ChallengeResp | null>(null);
  const [busy, setBusy] = useState<"challenge" | "verify" | "save" | "sync" | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);
  const [privacy, setPrivacy] = useState<TraderPrivacy>(DEFAULT_PRIVACY);
  const [bio, setBio] = useState("");

  const pending = me.data?.accounts.find((a) => a.status === "PENDING" && a.challenge_code);
  const verified = me.data?.accounts.find((a) => a.status === "VERIFIED");

  useEffect(() => {
    const t = me.data?.trader;
    if (t) {
      setPrivacy(Object.fromEntries(Object.keys(DEFAULT_PRIVACY).map((k) => [k, Boolean(t[k])])) as unknown as TraderPrivacy);
      setBio((t.bio as string) ?? "");
      setName(t.display_name);
    }
  }, [me.data?.trader]);

  if (!enabled)
    return (
      <Card className={className}>
        <CardHeader title="Become a verified trader" icon={<UserCheck className="h-4 w-4" />} />
        <CardBody>
          <NotConnected
            what="Trader verification requires an XRP Terminal account. This deployment runs in guest mode (no account database connected)."
            how="Verification proves wallet control with an on-chain memo — screenshots are never accepted."
            className="py-6"
          />
        </CardBody>
      </Card>
    );

  const run = async <T,>(kind: NonNullable<typeof busy>, fn: () => Promise<T>) => {
    setBusy(kind);
    setMsg(null);
    try {
      return await fn();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof ApiError ? e.message : "Request failed" });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const createChallenge = () => {
    const n = normalizeXrplAddress(address);
    if (!n.ok) return setMsg({ tone: "err", text: n.reason });
    return run("challenge", async () => {
      const r = await apiPost<ChallengeResp>("/api/traders/challenge", { address: n.classic, displayName: name.trim() || undefined });
      setChallenge(r);
      me.reload();
    });
  };

  const verify = (addr: string) =>
    run("verify", async () => {
      const r = await apiPost<{ status: string; message?: string; txHash?: string }>("/api/traders/verify", { address: addr });
      if (r.status === "VERIFIED") {
        toast({ title: "Wallet verified", description: "Your on-chain metrics are being computed.", tone: "success" });
        setChallenge(null);
      } else setMsg({ tone: "info", text: r.message ?? "Not found yet." });
      me.reload();
    });

  const save = () =>
    run("save", async () => {
      await apiPost("/api/traders/me", { display_name: name.trim() || undefined, bio: bio.trim() || null, ...privacy }, "PATCH");
      toast({ title: "Profile saved", tone: "success" });
      me.reload();
    });

  const sync = () =>
    run("sync", async () => {
      await apiPost("/api/traders/sync", {});
      toast({ title: "Metrics refreshed from the ledger", tone: "success" });
      me.reload();
    });

  const active = challenge?.code ? challenge : pending ? { status: "PENDING", address: pending.address, code: pending.challenge_code!, expiresAt: pending.challenge_expires_at ? Date.parse(pending.challenge_expires_at) : undefined } : null;

  return (
    <Card className={className}>
      <CardHeader
        title="Become a verified trader"
        icon={<UserCheck className="h-4 w-4" />}
        subtitle="Prove control of an XRPL address with an on-chain memo"
        actions={verified ? <TrustBadge kind="VERIFIED" /> : me.data?.trader ? <Badge tone="warning">{me.data.trader.verification_status}</Badge> : undefined}
      />
      <CardBody className="space-y-4">
        {authLoading || (user && me.loading && !me.data) ? (
          <Skeleton className="h-28 w-full" />
        ) : !user ? (
          <div className="space-y-3 text-sm text-fg-secondary">
            <p>Sign in to link a public XRPL wallet. Your metrics are then computed from validated ledger data — never from screenshots or self-reported numbers.</p>
            <ButtonLink href="/login" size="sm">
              Sign in to continue
            </ButtonLink>
          </div>
        ) : (
          <>
            {!verified && !active && (
              <div className="space-y-3">
                <Field label="Display name" htmlFor="tr-name">
                  <input id="tr-name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Shown on your public profile" />
                </Field>
                <Field label="Your XRPL address" htmlFor="tr-addr" hint="Classic r-address or X-address. Public data only.">
                  <input id="tr-addr" className="input font-mono" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="r…" spellCheck={false} autoComplete="off" />
                </Field>
                <Button size="sm" onClick={createChallenge} loading={busy === "challenge"}>
                  <KeyRound className="h-4 w-4" /> Get verification code
                </Button>
              </div>
            )}

            {!verified && active?.code && (
              <div className="space-y-3 rounded-lg border border-accent/25 bg-accent/5 p-3 animate-fade-up">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="warning">
                    <Clock className="h-3 w-3" /> Pending
                  </Badge>
                  <span className="font-mono text-2xs text-fg-muted">{active.address}</span>
                </div>
                <div>
                  <div className="label mb-1">Memo text</div>
                  <div className="flex items-center gap-2 rounded-md border border-border bg-bg-secondary px-3 py-2">
                    <code className="num flex-1 text-base font-semibold tracking-wider text-fg">{active.code}</code>
                    <CopyButton value={active.code} label="Copy memo" />
                  </div>
                </div>
                <ol className="list-decimal space-y-1 pl-4 text-xs text-fg-secondary">
                  {(challenge?.instructions ?? [
                    "Open your own XRPL wallet app for this address (XRP Terminal never asks for your seed or keys).",
                    "Send any small transaction FROM this address (e.g. a 1-drop payment to yourself) with the memo text above.",
                    "Come back and check verification within 48 hours.",
                  ]).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                {active.expiresAt && <p className="text-2xs text-fg-muted">Code expires {formatDateTime(active.expiresAt, tz)}.</p>}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => verify(active.address)} loading={busy === "verify"}>
                    <ShieldCheck className="h-4 w-4" /> Check verification
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setChallenge(null)}>
                    Use another address
                  </Button>
                </div>
              </div>
            )}

            {verified && (
              <div className="space-y-2 rounded-lg border border-success/25 bg-success/5 p-3 text-xs text-fg-secondary">
                <p className="flex items-center gap-1.5 font-medium text-success">
                  <BadgeCheck className="h-4 w-4" /> Wallet verified {verified.verified_at ? formatDateTime(verified.verified_at, tz) : ""}
                </p>
                <p className="break-all font-mono text-2xs">{verified.address}</p>
                {verified.verified_tx_hash && (
                  <p className="flex items-center gap-1 text-2xs">
                    Proof tx: <Hash value={verified.verified_tx_hash} href={`/xrpl/tx/${verified.verified_tx_hash}`} />
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="xs" variant="secondary" onClick={sync} loading={busy === "sync"}>
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh on-chain metrics
                  </Button>
                  {me.data?.trader && (
                    <ButtonLink href={`/social/trader/${me.data.trader.id}`} size="xs" variant="ghost">
                      View my profile
                    </ButtonLink>
                  )}
                </div>
                {verified.last_synced_at && <p className="text-2xs text-fg-muted">Last synced {formatDateTime(verified.last_synced_at, tz)}</p>}
              </div>
            )}

            {me.data?.trader && (
              <div className="space-y-3 border-t border-border-subtle pt-3">
                <h4 className="label">Profile & privacy</h4>
                <Field label="Display name" htmlFor="tr-name2">
                  <input id="tr-name2" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="Bio" htmlFor="tr-bio" hint="Guaranteed-profit claims, deposit requests and off-platform contact are rejected.">
                  <textarea id="tr-bio" className="input min-h-[60px] py-2" maxLength={400} value={bio} onChange={(e) => setBio(e.target.value)} />
                </Field>
                <ul className="space-y-2">
                  {(Object.keys(PRIVACY_LABELS) as (keyof TraderPrivacy)[]).map((k) => (
                    <li key={k} className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium text-fg">{PRIVACY_LABELS[k].label}</div>
                        <div className="text-2xs text-fg-muted">{PRIVACY_LABELS[k].hint}</div>
                      </div>
                      <Switch checked={privacy[k]} onChange={(v) => setPrivacy((p) => ({ ...p, [k]: v }))} label={PRIVACY_LABELS[k].label} />
                    </li>
                  ))}
                </ul>
                <Button size="sm" variant="secondary" onClick={save} loading={busy === "save"}>
                  Save profile
                </Button>
              </div>
            )}
          </>
        )}
        {msg && (
          <p className={`text-xs ${msg.tone === "err" ? "text-danger" : msg.tone === "ok" ? "text-success" : "text-fg-secondary"}`} role="status">
            {msg.text}
          </p>
        )}
        {me.error && me.error.status !== 401 && <p className="text-xs text-danger">{me.error.message}</p>}
      </CardBody>
    </Card>
  );
}
