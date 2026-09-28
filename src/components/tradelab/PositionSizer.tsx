"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { GLOSSARY } from "@/components/ui/Tooltip";
import { positionSize } from "@/lib/tradelab/risk";
import { KV, NumInput, qtyFmt, usd } from "./common";

export function PositionSizer({ equity, price, defaultRiskPct }: { equity: number | null; price: number | null; defaultRiskPct: number }) {
  const [account, setAccount] = useState("");
  const [risk, setRisk] = useState(String(defaultRiskPct || 1));
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  useEffect(() => {
    if (!account && equity) setAccount(String(Math.round(equity)));
  }, [equity, account]);
  useEffect(() => {
    if (!entry && price) {
      const p = Number(price.toPrecision(5));
      setEntry(String(p));
      setStop(String(Number((p * 0.97).toPrecision(5))));
      setTarget(String(Number((p * 1.06).toPrecision(5))));
    }
  }, [price, entry]);
  const r = useMemo(() => positionSize(Number(account), Number(risk), Number(entry), Number(stop), target ? Number(target) : null), [account, risk, entry, stop, target]);
  return (
    <Card>
      <CardHeader title="Position sizing" icon={<Calculator className="h-4 w-4" />} info="Size so that a stop-out loses a fixed % of the account. Excludes fees & slippage." />
      <CardBody className="space-y-2 pt-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-2xs text-fg-secondary">
            Account
            <NumInput value={account} onChange={setAccount} suffix="USD" ariaLabel="Account size" />
          </label>
          <label className="text-2xs text-fg-secondary">
            Risk
            <NumInput value={risk} onChange={setRisk} suffix="%" ariaLabel="Risk percent" />
          </label>
          <label className="text-2xs text-fg-secondary">
            Entry
            <NumInput value={entry} onChange={setEntry} ariaLabel="Entry price" />
          </label>
          <label className="text-2xs text-fg-secondary">
            Stop
            <NumInput value={stop} onChange={setStop} ariaLabel="Stop price" />
          </label>
          <label className="col-span-2 text-2xs text-fg-secondary">
            Target (optional)
            <NumInput value={target} onChange={setTarget} ariaLabel="Target price" />
          </label>
        </div>
        {r ? (
          <div className="rounded-lg border border-border-subtle bg-bg-secondary/60 p-2">
            <KV label="Position size" value={`${qtyFmt(r.qty)} XRP`} />
            <KV label="Notional" value={`${usd(r.notional)} (${r.positionPct.toFixed(1)}%)`} />
            <KV label="Risk amount" value={usd(r.riskAmount)} />
            <KV label="Potential profit" value={usd(r.potentialProfit)} />
            <KV label="Reward : risk" value={r.rewardRisk !== null ? `${r.rewardRisk.toFixed(2)} R` : "—"} tip={GLOSSARY.rMultiple} />
            {r.positionPct > 100 && <p className="mt-1 text-2xs text-warning">Exceeds account size — the stop is too tight for this risk % without leverage (not simulated).</p>}
          </div>
        ) : (
          <p className="text-2xs text-fg-muted">Enter an account size, risk %, and a stop below the entry.</p>
        )}
      </CardBody>
    </Card>
  );
}
