"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, Lock, ShieldAlert, Wallet } from "lucide-react";
import { Badge, TrustBadge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field } from "@/components/ui/Misc";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiPost, ApiError } from "@/hooks/useApi";
import { canAddConnectedAccount, canConnectExchange, planOf } from "@/lib/entitlements";
import { formatXrp } from "@/lib/format";
import { ACCOUNT_TYPE_INFO, type ConnectedAccount } from "@/lib/portfolio/types";
import { looksLikeSecret, SECRET_WARNING } from "@/lib/portfolio/validation";
import { normalizeXrplAddress } from "@/lib/xrpl/address";
import { dropsToXrpString } from "@/lib/xrpl/amount";
import { getXrplClient } from "@/lib/xrpl/client";
import type { AccountInfoResult } from "@/lib/xrpl/types";

type Kind = "xrpl" | "exchange" | "other";

export function ConnectAccountModal({
  open,
  onClose,
  accounts,
  addWallet,
  onExchangeConnected,
}: {
  open: boolean;
  onClose: () => void;
  accounts: ConnectedAccount[];
  addWallet: (i: { input: string; classic: string; tag?: number | null; label: string }) => Promise<ConnectedAccount>;
  onExchangeConnected: () => void;
}) {
  const [kind, setKind] = useState<Kind>("xrpl");
  const { plan } = useAuth();
  const limit = planOf(plan).limits.connectedAccounts;
  const atLimit = !canAddConnectedAccount(plan, accounts.length);
  return (
    <Modal open={open} onClose={onClose} title="Connect an account" description="Read-only. XRP Terminal never holds funds, signs transactions or asks for private keys." size="md">
      <Tabs
        value={kind}
        onChange={setKind}
        size="sm"
        className="mb-4"
        items={[
          { value: "xrpl", label: "XRPL wallet" },
          { value: "exchange", label: <span className="inline-flex items-center gap-1">Exchange <TrustBadge kind="BETA" /></span> },
          { value: "other", label: "Other" },
        ]}
      />
      {atLimit && kind !== "other" ? (
        <div className="space-y-3 text-center">
          <Lock className="mx-auto h-5 w-5 text-fg-muted" />
          <p className="text-sm text-fg">
            Your {planOf(plan).name} plan includes {Number.isFinite(limit) ? limit : "unlimited"} connected account{limit === 1 ? "" : "s"}.
          </p>
          <p className="text-xs text-fg-muted">Remove an account or upgrade to connect more. Limits are enforced on our servers too.</p>
          <ButtonLink href="/pricing" size="sm">
            See plans
          </ButtonLink>
        </div>
      ) : kind === "xrpl" ? (
        <XrplForm onDone={onClose} addWallet={addWallet} existing={accounts} />
      ) : kind === "exchange" ? (
        <ExchangeForm
          onDone={() => {
            onExchangeConnected();
            onClose();
          }}
        />
      ) : (
        <ul className="space-y-2">
          {(["BLOCKCHAIN_WALLET", "DEFI_ACCOUNT"] as const).map((t) => (
            <li key={t} className="rounded-lg border border-border-subtle p-3 opacity-80">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-fg">{ACCOUNT_TYPE_INFO[t].name}</span>
                <Badge tone="neutral">Planned</Badge>
              </div>
              <p className="mt-1 text-xs text-fg-muted">{ACCOUNT_TYPE_INFO[t].description}</p>
              <Button size="xs" variant="secondary" disabled className="mt-2">
                Not available yet
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function NoSecretsWarning() {
  return (
    <div className="flex gap-2 rounded-lg border border-danger/30 bg-danger/[0.06] px-3 py-2 text-2xs leading-relaxed text-fg-secondary" role="note">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      <span>
        <strong className="text-danger">Never enter a secret key, family seed (starts with “s”) or recovery phrase.</strong> We only need your <strong>public</strong> address (starts with “r” or “X”). No one legitimate will ever ask
        for your seed — XRP Terminal cannot sign transactions or move funds.
      </span>
    </div>
  );
}

function XrplForm({ onDone, addWallet, existing }: { onDone: () => void; addWallet: (i: { input: string; classic: string; tag?: number | null; label: string }) => Promise<ConnectedAccount>; existing: ConnectedAccount[] }) {
  const toast = useToast();
  const { user } = useAuth();
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (looksLikeSecret(address)) {
      setAddress("");
      return setErr(SECRET_WARNING);
    }
    const n = normalizeXrplAddress(address);
    if (!n.ok) return setErr(n.reason);
    const tag = typeof n.tag === "number" ? n.tag : null;
    if (existing.some((a) => a.address === n.classic && (a.tag ?? null) === tag)) return setErr("This wallet is already connected.");
    setBusy(true);
    try {
      let balance: number | null = null;
      if (!user) {
        // Guest mode: verify existence directly against the XRP Ledger from the browser.
        try {
          const info = await getXrplClient().request<AccountInfoResult>("account_info", { account: n.classic, ledger_index: "validated" });
          balance = Number(dropsToXrpString(info.account_data.Balance));
        } catch (e2) {
          const code = (e2 as Error & { code?: string }).code;
          setErr(code === "actNotFound" ? "This address does not exist on the validated XRP Ledger (never funded or deleted)." : `Could not verify on the XRP Ledger: ${(e2 as Error).message}`);
          return;
        }
      }
      await addWallet({ input: address.trim(), classic: n.classic, tag, label: label.trim() });
      toast({ title: "Wallet connected", description: balance !== null ? `${formatXrp(balance)} found on the validated ledger.` : "Verified on the validated ledger.", tone: "success" });
      setAddress("");
      setLabel("");
      onDone();
    } catch (e3) {
      setErr(e3 instanceof ApiError ? e3.message : (e3 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <NoSecretsWarning />
      <Field label="Public XRPL address" htmlFor="wallet-address" error={err} hint="Classic (r…) or X-address. We check the format and that the account exists on the validated ledger.">
        <input
          id="wallet-address"
          className="input font-mono text-xs"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            setErr(null);
          }}
          autoComplete="off"
          spellCheck={false}
          placeholder="rXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
          required
        />
      </Field>
      <Field label="Label (optional)" htmlFor="wallet-label">
        <input id="wallet-label" className="input" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Ledger Nano" />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" loading={busy}>
          <Wallet className="h-4 w-4" /> Verify & connect
        </Button>
      </div>
    </form>
  );
}

function ExchangeForm({ onDone }: { onDone: () => void }) {
  const { enabled, user, plan, loading } = useAuth();
  const toast = useToast();
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [label, setLabel] = useState("Binance");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!enabled || !user || !canConnectExchange(plan)) {
    const reason = !enabled
      ? "Exchange connections need an XRP Terminal account on the Pro plan. Accounts are not enabled on this deployment yet, so there is nowhere to store an encrypted, read-only key safely — we will not keep exchange keys in your browser."
      : !user
        ? "Sign in to connect an exchange. Keys are encrypted on our servers and tied to your account; they are never stored in the browser."
        : "Exchange connections are part of the Pro plan.";
    return (
      <div className="space-y-3 text-center">
        <Lock className="mx-auto h-5 w-5 text-fg-muted" />
        <p className="text-xs leading-relaxed text-fg-secondary">{reason}</p>
        {enabled && !user ? (
          <ButtonLink href="/login" size="sm">
            Sign in
          </ButtonLink>
        ) : enabled ? (
          <ButtonLink href="/pricing" size="sm">
            Upgrade to Pro
          </ButtonLink>
        ) : null}
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await apiPost("/api/portfolio/exchange/connect", { exchange: "binance", apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), label: label.trim() });
      setApiKey("");
      setApiSecret("");
      toast({ title: "Binance connected (read-only)", tone: "success" });
      onDone();
    } catch (e2) {
      setErr((e2 as Error).message);
      setApiSecret("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" autoComplete="off">
      <div className="rounded-lg border border-border-subtle bg-surface-hover/40 px-3 py-2 text-2xs leading-relaxed text-fg-secondary">
        <p className="mb-1 flex items-center gap-1 font-medium text-fg">
          <KeyRound className="h-3.5 w-3.5 text-accent" /> Read-only Binance API key
        </p>
        In Binance → API Management, create a key with <strong>only “Enable Reading”</strong>. We check the key&apos;s permissions with Binance and <strong>reject it</strong> if withdrawals, transfers, spot/margin or futures
        trading are enabled. The secret is encrypted (AES-256-GCM) on our server, never logged, and never shown again. Restricting the key to trusted IPs is recommended.
      </div>
      <Field label="API key" htmlFor="bn-key">
        <input id="bn-key" className="input font-mono text-xs" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" spellCheck={false} required minLength={16} />
      </Field>
      <Field label="API secret" htmlFor="bn-secret" error={err}>
        <input id="bn-secret" type="password" className="input font-mono text-xs" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} autoComplete="new-password" spellCheck={false} required minLength={16} />
      </Field>
      <Field label="Label" htmlFor="bn-label">
        <input id="bn-label" className="input" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <div className="flex items-center justify-between gap-2">
        <Link href="/legal/privacy" className="text-2xs text-fg-muted hover:text-fg">
          How we store credentials
        </Link>
        <Button type="submit" loading={busy}>
          Verify read-only & connect
        </Button>
      </div>
    </form>
  );
}
