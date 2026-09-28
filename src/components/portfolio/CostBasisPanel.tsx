"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Field, Stat } from "@/components/ui/Misc";
import { Tabs } from "@/components/ui/Tabs";
import { useMarket } from "@/components/providers/MarketProvider";
import { readLocal, writeLocal } from "@/lib/storage/local";
import { formatMoney, formatNumber, formatPct, formatSignedMoney } from "@/lib/format";
import { computeCostBasis, costBasisCoverage, sortLots, validateLot } from "@/lib/portfolio/costBasis";
import { newId } from "@/lib/portfolio/repo";
import type { CostMethod, Lot } from "@/lib/portfolio/types";
import type { Fiat } from "@/lib/types/market";
import { cn } from "@/lib/utils/cn";

const today = () => new Date().toISOString().slice(0, 10);

/** Manual cost-basis lots with FIFO / average-cost calculators (decimal.js). */
export function CostBasisPanel({
  lots,
  save,
  remove,
  holdingsXrp,
  storage,
  className,
}: {
  lots: Lot[] | null;
  save: (l: Lot) => Promise<void>;
  remove: (id: string) => Promise<void>;
  holdingsXrp: number | null;
  storage: "local" | "account";
  className?: string;
}) {
  const { ticker, fx } = useMarket();
  const [method, setMethod] = useState<CostMethod>("FIFO");
  const [ccy, setCcy] = useState<Fiat>("USD");
  useEffect(() => {
    const m = readLocal<CostMethod>("portfolio:costMethod", "FIFO");
    const c = readLocal<Fiat>("portfolio:costCurrency", "USD");
    if (m === "FIFO" || m === "AVERAGE") setMethod(m);
    if (c === "USD" || c === "EUR" || c === "GBP") setCcy(c);
  }, []);
  const [form, setForm] = useState({ side: "buy" as "buy" | "sell", date: today(), qty: "", price: "", fee: "0", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const all = lots ?? [];
  const inCcy = all.filter((l) => l.currency === ccy);
  const otherCcy = all.length - inCcy.length;
  const rate = ccy === "USD" ? 1 : fx?.rates[ccy];
  const priceInCcy = ticker && rate ? ticker.price * rate : null;
  const res = useMemo(() => computeCostBasis(inCcy, method, priceInCcy), [inCcy, method, priceInCcy]);
  const cov = holdingsXrp !== null ? costBasisCoverage(res, holdingsXrp, inCcy.length > 0) : null;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validateLot(form);
    if (v) return setErr(v);
    setBusy(true);
    try {
      await save({ id: newId(), asset: "XRP", side: form.side, date: form.date, qty: form.qty.trim(), price: form.price.trim(), fee: (form.fee || "0").trim(), currency: ccy, note: form.note.trim() || undefined, createdAt: Date.now() });
      setForm((f) => ({ ...f, qty: "", price: "", fee: "0", note: "" }));
      setErr(null);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const money = (v: string | null) => (v === null ? "—" : formatMoney(Number(v), ccy));
  return (
    <Card className={className} id="cost-basis">
      <CardHeader
        title="Cost basis & P&L"
        icon={<Calculator className="h-4 w-4" />}
        subtitle={`Manual XRP lots · ${storage === "account" ? "saved to your account" : "saved in this browser"}`}
        info="Enter your XRP buys and sells. Buy fees are added to cost; sell fees reduce proceeds. FIFO sells the oldest lots first; average cost uses the running average. Nothing is imported or guessed."
        actions={
          <div className="flex items-center gap-2">
            <Tabs value={method} onChange={(m) => { setMethod(m); writeLocal("portfolio:costMethod", m); }} size="xs" items={[{ value: "FIFO", label: "FIFO" }, { value: "AVERAGE", label: "Average" }]} ariaLabel="Cost method" />
            <select className="select h-7 text-2xs" value={ccy} onChange={(e) => { setCcy(e.target.value as Fiat); writeLocal("portfolio:costCurrency", e.target.value); }} aria-label="Cost basis currency">
              {(["USD", "EUR", "GBP"] as Fiat[]).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        }
      />
      <CardBody className="space-y-4">
        {cov?.message && (
          <p className="flex gap-2 rounded-lg border border-warning/30 bg-warning/[0.06] px-3 py-2 text-xs text-warning" role="status">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>{cov.message}</strong>{" "}
              {cov.state === "no-lots"
                ? "Add your buys to calculate cost basis and P&L."
                : cov.state === "incomplete"
                  ? `Lots cover ${formatNumber(Number(cov.lotsQty), 2)} XRP of ${formatNumber(Number(cov.holdingsQty), 2)} XRP held${Number(res.unmatchedSellQty) > 0 ? "; some sells exceed recorded buys" : ""}. Figures below cover recorded lots only.`
                  : ""}
            </span>
          </p>
        )}
        <div className="grid gap-x-8 md:grid-cols-2">
          <div className="divide-y divide-border-subtle/60">
            <Stat label="Open quantity (from lots)" value={`${formatNumber(Number(res.remainingQty), 6)} XRP`} />
            <Stat label="Cost basis" value={money(res.costBasis)} />
            <Stat label="Average acquisition cost" value={res.avgCost ? `${formatMoney(Number(res.avgCost), ccy, 4)} / XRP` : "—"} />
            <Stat label="Fees recorded" value={money(res.feesTotal)} />
          </div>
          <div className="divide-y divide-border-subtle/60">
            <Stat label="Realized P&L" value={<span className={Number(res.realizedPnl) >= 0 ? "text-success" : "text-danger"}>{formatSignedMoney(Number(res.realizedPnl), ccy)}</span>} />
            <Stat
              label="Unrealized P&L (open lots)"
              value={
                res.unrealizedPnl === null ? (
                  "price unavailable"
                ) : (
                  <span className={Number(res.unrealizedPnl) >= 0 ? "text-success" : "text-danger"}>
                    {formatSignedMoney(Number(res.unrealizedPnl), ccy)} {res.unrealizedPct !== null && <span className="text-2xs">({formatPct(res.unrealizedPct)})</span>}
                  </span>
                )
              }
            />
            <Stat label="Market value of open lots" value={money(res.marketValue)} />
            <Stat label="Current price used" value={priceInCcy ? `${formatMoney(priceInCcy, ccy, 4)}` : "—"} />
          </div>
        </div>
        {res.warnings.length > 0 && (
          <ul className="space-y-1 text-2xs text-warning">
            {res.warnings.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        )}
        {otherCcy > 0 && <p className="text-2xs text-fg-muted">{otherCcy} lot(s) recorded in another currency are excluded from this {ccy} calculation.</p>}

        <form onSubmit={add} className="grid grid-cols-2 gap-2 rounded-lg border border-border-subtle p-3 sm:grid-cols-6">
          <Field label="Side" htmlFor="lot-side">
            <select id="lot-side" className="select h-9 text-xs" value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value as "buy" | "sell" })}>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </Field>
          <Field label="Date" htmlFor="lot-date">
            <input id="lot-date" type="date" className="input h-9 text-xs" max={today()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </Field>
          <Field label="XRP qty" htmlFor="lot-qty">
            <input id="lot-qty" inputMode="decimal" className="input num h-9 text-xs" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value.replace(",", ".") })} placeholder="1000" required />
          </Field>
          <Field label={`Price (${ccy}/XRP)`} htmlFor="lot-price">
            <input id="lot-price" inputMode="decimal" className="input num h-9 text-xs" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(",", ".") })} placeholder="0.52" required />
          </Field>
          <Field label={`Fee (${ccy})`} htmlFor="lot-fee">
            <input id="lot-fee" inputMode="decimal" className="input num h-9 text-xs" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value.replace(",", ".") })} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" size="sm" className="h-9 w-full" loading={busy}>
              <Plus className="h-3.5 w-3.5" /> Add lot
            </Button>
          </div>
          {err && <p className="col-span-full text-2xs text-danger">{err}</p>}
        </form>

        {all.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th scope="col" className="label px-2 py-1.5 text-left font-medium">Date</th>
                  <th scope="col" className="label px-2 py-1.5 text-left font-medium">Side</th>
                  <th scope="col" className="label px-2 py-1.5 text-right font-medium">Qty</th>
                  <th scope="col" className="label px-2 py-1.5 text-right font-medium">Price</th>
                  <th scope="col" className="label hidden px-2 py-1.5 text-right font-medium sm:table-cell">Fee</th>
                  <th scope="col" className="px-2 py-1.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {sortLots(all).map((l) => (
                  <tr key={l.id} className={cn("border-b border-border-subtle/60 last:border-0", l.currency !== ccy && "opacity-50")}>
                    <td className="num px-2 py-1.5 text-fg-secondary">{l.date}</td>
                    <td className="px-2 py-1.5">
                      <Badge tone={l.side === "buy" ? "success" : "danger"}>{l.side}</Badge>
                    </td>
                    <td className="num px-2 py-1.5 text-right">{formatNumber(Number(l.qty), 6)}</td>
                    <td className="num px-2 py-1.5 text-right">{formatMoney(Number(l.price), l.currency, 4)}</td>
                    <td className="num hidden px-2 py-1.5 text-right sm:table-cell">{formatMoney(Number(l.fee), l.currency)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button className="rounded p-1 text-fg-muted hover:bg-surface-hover hover:text-danger" aria-label={`Delete lot ${l.date}`} onClick={() => void remove(l.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
      <CardFooter>
        <span>Deterministic calculation (decimal arithmetic). Not tax advice — tax rules on cost methods differ by country.</span>
      </CardFooter>
    </Card>
  );
}
