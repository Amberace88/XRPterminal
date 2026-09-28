"use client";

import { useState } from "react";
import { FlaskConical, ShieldCheck, Wallet } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/hooks/useT";
import { DEFAULT_STARTING_CAPITAL, STARTING_CAPITAL_OPTIONS } from "@/lib/tradelab/types";
import { PaperNotice, usd } from "./common";
import { useTradeLab } from "./TradeLabProvider";

/** First step of the Trade Lab journey (spec §293): choose demo capital. */
export function Onboarding({ onCancel }: { onCancel?: () => void }) {
  const t = useT();
  const toast = useToast();
  const { createAccount, repoKind, accounts, maxAccounts } = useTradeLab();
  const [capital, setCapital] = useState<number>(DEFAULT_STARTING_CAPITAL);
  const [name, setName] = useState(accounts.length ? `Paper account ${accounts.length + 1}` : "My paper account");
  const [busy, setBusy] = useState(false);
  const atLimit = repoKind === "supabase" && accounts.length >= maxAccounts;
  const start = async () => {
    setBusy(true);
    try {
      await createAccount(capital, name);
      toast({ tone: "success", title: "Paper account created", description: `${usd(capital, 0)} of virtual capital assigned (simulated).` });
      onCancel?.();
    } catch (e) {
      toast({ tone: "danger", title: "Could not create the paper account", description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mx-auto max-w-2xl animate-fade-up">
      <CardBody className="space-y-5 p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning/10 text-warning">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-fg">Choose your demo capital</h2>
            <p className="mt-1 text-sm text-fg-secondary">
              Trade Lab simulates orders against real XRP market data with <strong className="text-fg">virtual money only</strong>. You cannot deposit real funds, and virtual balances can never be withdrawn.
            </p>
          </div>
        </div>
        <div role="radiogroup" aria-label="Starting capital" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {STARTING_CAPITAL_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={capital === c}
              onClick={() => setCapital(c)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                capital === c ? "border-accent bg-accent/10 shadow-glow" : "border-border-subtle hover:border-border hover:bg-surface-hover",
              )}
            >
              <span className="num block text-base font-semibold text-fg">{usd(c, 0)}</span>
              <span className="text-2xs text-fg-muted">{c === DEFAULT_STARTING_CAPITAL ? "Default" : "virtual"}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5 text-xs font-medium text-fg-secondary">
            Account name
            <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </label>
          <Button onClick={start} loading={busy} disabled={atLimit} className="sm:w-56">
            <Wallet className="h-4 w-4" /> Start paper trading
          </Button>
        </div>
        {atLimit && <p className="text-xs text-warning">Your plan allows {maxAccounts} paper account(s).</p>}
        <ul className="grid gap-2 text-xs text-fg-muted sm:grid-cols-3">
          <li className="flex gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-accent" /> Market, limit, stop & stop-limit with SL/TP
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-accent" /> Fees & slippage simulated and always shown
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-accent" /> Immutable ledger — every balance change is recorded
          </li>
        </ul>
        {repoKind === "local" && <p className="text-2xs text-fg-muted">{t("common.guestMode")}.</p>}
        <div className="flex items-center justify-between gap-2">
          <PaperNotice />
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
