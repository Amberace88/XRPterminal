"use client";

import { useMemo, useState } from "react";
import { FlaskConical } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SimulatedBanner, Field } from "@/components/ui/Misc";
import { TrustBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/States";
import { LineChart } from "@/components/charts/Charts";
import { formatDate, formatNumber, formatPct } from "@/lib/format";
import { simulateMimic } from "@/lib/social/metrics";
import type { ClosedTrade } from "@/lib/social/types";

/**
 * Simulated mimic (spec §87, §290). Hypothetical only — NOT copy trading, no real orders.
 * Amounts are in the trader's quote asset.
 */
export function MimicSimulation({ trades, quoteLabel, enabled, reason }: { trades: ClosedTrade[]; quoteLabel: string; enabled: boolean; reason?: string }) {
  const [capital, setCapital] = useState(10_000);
  const [alloc, setAlloc] = useState(25);
  const [fee, setFee] = useState(0.1);
  const [slip, setSlip] = useState(10);
  const valid = capital > 0 && alloc > 0 && alloc <= 100 && fee >= 0 && fee < 5 && slip >= 0 && slip <= 500;
  const res = useMemo(() => (enabled && valid && trades.length ? simulateMimic(trades, { capital, allocationPct: alloc, feePct: fee, slippageBps: slip }) : null), [enabled, valid, trades, capital, alloc, fee, slip]);
  const curve = useMemo(() => (res ? [{ t: res.rows[0]?.entryTime ?? 0, equity: res.startEquity }, ...res.rows.map((r) => ({ t: r.exitTime, equity: r.equityAfter }))] : []), [res]);

  return (
    <Card>
      <CardHeader title="Simulated mimic" icon={<FlaskConical className="h-4 w-4" />} subtitle="Hypothetical simulation based on publicly available trader activity." actions={<TrustBadge kind="SIMULATED" />} />
      <CardBody className="space-y-4">
        <SimulatedBanner compact />
        {!enabled ? (
          <EmptyState title="Simulation unavailable" description={reason ?? "This trader has not made individual trades public, so there is nothing to simulate."} className="py-6" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label={`Starting capital (${quoteLabel})`} htmlFor="m-cap">
                <input id="m-cap" type="number" min={1} className="input num" value={capital} onChange={(e) => setCapital(Number(e.target.value))} />
              </Field>
              <Field label="Allocation per trade %" htmlFor="m-alloc">
                <input id="m-alloc" type="number" min={1} max={100} className="input num" value={alloc} onChange={(e) => setAlloc(Number(e.target.value))} />
              </Field>
              <Field label="Fee per side %" htmlFor="m-fee">
                <input id="m-fee" type="number" min={0} step={0.01} className="input num" value={fee} onChange={(e) => setFee(Number(e.target.value))} />
              </Field>
              <Field label="Slippage (bps/side)" htmlFor="m-slip">
                <input id="m-slip" type="number" min={0} className="input num" value={slip} onChange={(e) => setSlip(Number(e.target.value))} />
              </Field>
            </div>
            {!valid && <p className="text-xs text-danger">Check the inputs (allocation 1–100%, fee &lt; 5%, slippage ≤ 500 bps).</p>}
            {res && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["Hypothetical result", formatPct(res.returnPct)],
                    ["End equity", `${formatNumber(res.endEquity, 2)} ${quoteLabel}`],
                    ["Fees + slippage", `${formatNumber(res.totalFees + res.totalSlippage, 2)} ${quoteLabel}`],
                    ["Max drawdown", `−${res.maxDrawdownPct.toFixed(1)}%`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-border-subtle p-2.5">
                      <div className="label">{k}</div>
                      <div className="num mt-0.5 text-sm font-semibold text-fg">{v}</div>
                    </div>
                  ))}
                </div>
                {curve.length > 2 && <LineChart data={curve} x="t" series={[{ key: "equity", label: "Hypothetical equity" }]} height={180} xFormat={(v) => formatDate(Number(v))} yFormat={(v) => formatNumber(v, 0)} legend={false} area />}
                <div className="-mx-4 max-h-64 overflow-auto sm:-mx-5">
                  <table className="w-full min-w-[560px] text-2xs">
                    <thead className="sticky top-0 bg-surface">
                      <tr className="border-b border-border-subtle text-left uppercase tracking-wide text-fg-muted">
                        <th className="px-4 py-1.5 sm:px-5">Entry</th>
                        <th className="py-1.5">Exit</th>
                        <th className="py-1.5 text-right">Entry px</th>
                        <th className="py-1.5 text-right">Exit px</th>
                        <th className="py-1.5 text-right">Size (XRP)</th>
                        <th className="py-1.5 text-right">Fees</th>
                        <th className="py-1.5 text-right">Slippage</th>
                        <th className="px-4 py-1.5 text-right sm:px-5">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...res.rows].reverse().slice(0, 100).map((r, i) => (
                        <tr key={i} className="border-b border-border-subtle/50">
                          <td className="px-4 py-1.5 sm:px-5">{formatDate(r.entryTime)}</td>
                          <td className="py-1.5">{formatDate(r.exitTime)}</td>
                          <td className="num py-1.5 text-right">{r.entryPrice.toFixed(5)}</td>
                          <td className="num py-1.5 text-right">{r.exitPrice.toFixed(5)}</td>
                          <td className="num py-1.5 text-right">{formatNumber(r.qty, 0)}</td>
                          <td className="num py-1.5 text-right">{formatNumber(r.fees, 2)}</td>
                          <td className="num py-1.5 text-right">{formatNumber(r.slippageCost, 2)}</td>
                          <td className={`num px-4 py-1.5 text-right sm:px-5 ${r.result >= 0 ? "text-success" : "text-danger"}`}>{formatNumber(r.result, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-2xs text-fg-muted">
                  Assumes each public trade is replicated at its recorded entry/exit prices adjusted by your slippage, sequentially from current equity. Real fills, liquidity and timing would differ. Past performance does not guarantee future results. This is not copy trading and places no orders.
                </p>
              </>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
