"use client";

import { useId, useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Misc";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/States";
import { useMarket } from "@/components/providers/MarketProvider";
import { utcDate } from "@/components/market/parts";
import { applyStress, buildStressScenarios } from "@/lib/analytics/stress";
import { formatMoney, formatPct, formatPrice, formatSignedMoney } from "@/lib/format";
import type { CandleSeries } from "@/lib/types/market";
import { Note, Section } from "./Section";

type Mode = "xrp" | "usd";

function parseNum(s: string): number | null {
  const v = Number(s.replace(/[, _]/g, ""));
  return Number.isFinite(v) && v >= 0 ? v : null;
}

export function StressSection({ xrp, btc }: { xrp: CandleSeries; btc: CandleSeries | null }) {
  const { ticker, status } = useMarket();
  const [mode, setMode] = useState<Mode>("xrp");
  const [amount, setAmount] = useState("10000");
  const [other, setOther] = useState("");
  const idA = useId();
  const idO = useId();
  const { scenarios, betaXrpBtc, betaN } = useMemo(() => buildStressScenarios(xrp.candles, btc?.candles ?? null), [xrp, btc]);

  const lastClose = xrp.candles[xrp.candles.length - 1]?.c ?? null;
  const useLive = ticker && status !== "UNAVAILABLE" && status !== "STALE";
  const price = useLive ? ticker.price : lastClose;
  const priceSource = useLive ? `${ticker.provenance.source} (live)` : `${xrp.provenance.source} latest daily close`;

  const a = parseNum(amount);
  const o = parseNum(other) ?? 0;
  const xrpValue = a === null || price === null ? null : mode === "xrp" ? a * price : a;
  const invalid = amount.trim() !== "" && a === null;

  return (
    <Section
      id="stress"
      title="Stress testing"
      icon={<ShieldAlert className="h-4 w-4" />}
      subtitle="Apply historical XRP moves to a hypothetical position"
      provenance={xrp.provenance}
      actions={<Badge tone="warning">Hypothetical</Badge>}
      methodology={
        <>
          <p>Each scenario applies one historical XRP price move, measured from the loaded daily data, instantly to the position you enter. Other holdings you enter are held constant. No fees, slippage or liquidity effects are modelled.</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>Worst 30-day decline: the most negative peak-to-trough fall inside any 30-calendar-day window.</li>
            <li>2018 bear market and COVID crash: peak-to-trough decline within the fixed calendar windows (1 Jan–31 Dec 2018; 1 Feb–31 Mar 2020), shown only if the dataset covers them.</li>
            <li>
              BTC stress × beta: BTC&apos;s worst 30-day decline translated to XRP with XRP&apos;s trailing 365D beta to BTC (XRP log move = β × BTC log move){betaXrpBtc !== null ? `; β = ${betaXrpBtc.toFixed(2)}, N = ${betaN}` : ""}.
            </li>
            <li>Volatility spike: a 2-sigma 30-day decline at the 95th-percentile historical 30D volatility.</li>
            <li>Liquidity-reduction scenarios are not modelled because no historical order-book depth is connected.</li>
          </ul>
          <p>Results are hypothetical illustrations of past magnitudes — not predictions and not advice.</p>
        </>
      }
      footer={<span>Nothing you enter is stored or sent</span>}
    >
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr] sm:items-end">
        <Tabs
          ariaLabel="Input mode"
          value={mode}
          onChange={setMode}
          items={[
            { value: "xrp", label: "XRP amount" },
            { value: "usd", label: "Position value (USD)" },
          ]}
        />
        <Field label={mode === "xrp" ? "XRP held" : "XRP position value (USD)"} htmlFor={idA} error={invalid ? "Enter a positive number" : null}>
          <input id={idA} className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={mode === "xrp" ? "e.g. 10000" : "e.g. 5000"} />
        </Field>
        <Field label="Other holdings, held constant (USD, optional)" htmlFor={idO}>
          <input id={idO} className="input num" inputMode="decimal" value={other} onChange={(e) => setOther(e.target.value)} placeholder="0" />
        </Field>
      </div>
      <p className="text-2xs text-fg-muted">
        Valuation price: {price !== null ? formatPrice(price, "USD") : "—"} · {priceSource}
        {xrpValue !== null && mode === "xrp" ? ` · position value ${formatMoney(xrpValue)}` : ""}
      </p>
      {!scenarios.length ? (
        <EmptyState title="No scenarios available" description="The loaded history is too short to measure historical stress episodes." />
      ) : (
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                {["Scenario", "Window", "XRP move", "Portfolio after", "Change"].map((h, i) => (
                  <th key={h} scope="col" className={`label py-1.5 font-medium ${i > 1 ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => {
                const out = xrpValue !== null ? applyStress(xrpValue, s.movePct, o) : null;
                return (
                  <tr key={s.id} className="border-b border-border-subtle/60 align-top last:border-0">
                    <th scope="row" className="py-2 pr-2 text-left font-normal">
                      <span className="block text-sm font-medium text-fg">{s.name}</span>
                      <span className="block max-w-sm text-2xs text-fg-muted">{s.detail}</span>
                    </th>
                    <td className="whitespace-nowrap py-2 text-2xs text-fg-secondary">{s.windowStart ? `${utcDate(s.windowStart)} → ${utcDate(s.windowEnd)}` : "model"}</td>
                    <td className={`py-2 text-right ${s.movePct < 0 ? "text-danger" : "text-success"}`}>{formatPct(s.movePct, 1)}</td>
                    <td className="py-2 text-right text-fg">{out ? formatMoney(out.after) : "—"}</td>
                    <td className="py-2 text-right">
                      {out ? (
                        <>
                          <span className={out.change < 0 ? "text-danger" : "text-success"}>{formatSignedMoney(out.change)}</span>
                          <span className="block text-2xs text-fg-muted">{formatPct(out.changePct, 1)} of portfolio</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Note>Hypothetical scenario analysis based on historical magnitudes. Future moves can be larger or smaller than anything in the dataset.</Note>
    </Section>
  );
}
