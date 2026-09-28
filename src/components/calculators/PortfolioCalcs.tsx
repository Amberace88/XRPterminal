"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SourceLine } from "@/components/ui/DataFreshness";
import { toneOf } from "@/components/ui/MetricCard";
import { LineChart } from "@/components/charts/Charts";
import { useDailyHistory, useSnapshot } from "@/hooks/useMarketData";
import { compound, dca, drawdownFromPeak, FREQ_DAYS, flatPath, historicalPath, impliedMarketCap, impliedPrice, linearPath, maxDrawdown, portfolioScenario, scenario, type DcaFrequency } from "@/lib/calculators";
import { formatCompactMoney, formatDate, formatMoney, formatNumber, formatPct, formatPrice, formatSignedMoney } from "@/lib/format";
import { CalcCard, Invalid, NumField, Result, Seg, usePriceSeed } from "./primitives";

const Hypo = () => <Badge tone="warning">Hypothetical scenario</Badge>;

export function CompoundCalc() {
  const [p, setP] = useState(1000);
  const [rate, setRate] = useState(2);
  const [n, setN] = useState(24);
  const [c, setC] = useState(100);
  const r = compound(p, rate, n, c);
  return (
    <CalcCard id="compound" title="Compound return" subtitle="Growth at a constant rate per period, with optional contributions" badge={<Badge tone="neutral">Assumed rate</Badge>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumField label="Starting amount" value={p} onChange={setP} />
        <NumField label="Return per period" value={rate} onChange={setRate} suffix="%" />
        <NumField label="Periods" value={n} onChange={setN} step={1} />
        <NumField label="Contribution / period" value={c} onChange={setC} />
      </div>
      {r ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Result label="Final value" value={formatMoney(r.final)} big />
            <Result label="Contributed" value={formatMoney(r.totalContributed)} />
            <Result label="Growth" value={`${formatSignedMoney(r.gain)} (${formatPct(r.gainPct, 1)})`} tone={toneOf(r.gain)} />
          </div>
          {r.series.length > 2 && (
            <div className="mt-3">
              <LineChart data={r.series} x="period" series={[{ key: "value", label: "Value" }, { key: "contributed", label: "Contributed", dashed: true }]} height={180} yFormat={(v) => formatCompactMoney(v)} />
            </div>
          )}
          <p className="mt-2 text-2xs text-fg-muted">A constant return is an assumption for illustration; real returns are volatile and can be negative.</p>
        </>
      ) : (
        <Invalid />
      )}
    </CalcCard>
  );
}

export function DrawdownCalc({ price }: { price: number | null }) {
  const [peak, setPeak] = useState(NaN);
  const [cur, setCur] = useState(NaN);
  usePriceSeed(price, setCur);
  const hist = useDailyHistory("XRP-USD");
  const closes = hist.data?.candles ?? [];
  const ath = useMemo(() => (closes.length ? closes.reduce((a, c) => (c.c > a.c ? c : a)) : null), [closes]);
  const mdd = useMemo(() => maxDrawdown(closes.map((c) => c.c)), [closes]);
  const r = drawdownFromPeak(peak, cur);
  return (
    <CalcCard id="drawdown" title="Drawdown" subtitle="Decline from a peak and the gain needed to recover">
      <div className="grid grid-cols-2 gap-3">
        <NumField label="Peak value" value={peak} onChange={setPeak} />
        <NumField label="Current value" value={cur} onChange={setCur} />
      </div>
      {ath && price && (
        <Button variant="ghost" size="xs" className="mt-2" onClick={() => setPeak(ath.c)}>
          Use XRP highest daily close ({formatPrice(ath.c)}, {formatDate(ath.t)})
        </Button>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {r ? (
          <>
            <Result label="Drawdown" value={formatPct(-r.drawdownPct, 2)} tone="down" big />
            <Result label="Gain to recover" value={Number.isFinite(r.recoveryPct) ? formatPct(r.recoveryPct, 1) : "∞"} />
          </>
        ) : (
          <Invalid text="Current must be ≤ peak." />
        )}
      </div>
      {mdd && closes.length > 0 && (
        <div className="mt-3 border-t border-border-subtle pt-3 text-xs text-fg-secondary">
          Largest peak-to-trough decline in XRP daily closes in this history: <strong className="num text-danger">{formatPct(-mdd.maxDrawdownPct, 1)}</strong> ({formatDate(closes[mdd.peakIndex].t)} → {formatDate(closes[mdd.troughIndex].t)}).
          <div className="mt-1">
            <SourceLine provenance={hist.data?.provenance} />
          </div>
        </div>
      )}
    </CalcCard>
  );
}

interface Row {
  asset: string;
  qty: number;
  price: number;
  scenarioPrice: number;
}

export function PortfolioScenarioCalc({ price }: { price: number | null }) {
  const [rows, setRows] = useState<Row[]>([{ asset: "XRP", qty: 1000, price: NaN, scenarioPrice: NaN }]);
  usePriceSeed(price, (v) => setRows((r) => r.map((x, i) => (i === 0 && x.asset === "XRP" ? { ...x, price: v, scenarioPrice: Number((v * 1.2).toPrecision(5)) } : x))));
  const res = portfolioScenario(rows);
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <CalcCard id="portfolio" title="Portfolio scenario" subtitle="Value of several holdings under assumed prices" badge={<Hypo />}>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-fg-secondary" htmlFor={`pf-a-${i}`}>
                Asset
              </label>
              <input id={`pf-a-${i}`} className="input" value={row.asset} maxLength={12} onChange={(e) => set(i, { asset: e.target.value })} />
            </div>
            <NumField label="Qty" value={row.qty} onChange={(v) => set(i, { qty: v })} />
            <NumField label="Price" value={row.price} onChange={(v) => set(i, { price: v })} />
            <NumField label="Scenario" value={row.scenarioPrice} onChange={(v) => set(i, { scenarioPrice: v })} />
            <button type="button" className="mb-1 rounded-md p-2 text-fg-muted hover:text-danger disabled:opacity-30" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} disabled={rows.length === 1} aria-label="Remove holding">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button variant="outline" size="xs" onClick={() => setRows((r) => [...r, { asset: "", qty: 0, price: NaN, scenarioPrice: NaN }])} disabled={rows.length >= 10}>
          <Plus className="h-3.5 w-3.5" /> Add holding
        </Button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Result label="Current value" value={formatMoney(res.value)} />
        <Result label="Scenario value" value={formatMoney(res.scenarioValue)} big />
        <Result label="Change" value={`${formatSignedMoney(res.absChange)}${res.pctChange !== null ? ` (${formatPct(res.pctChange, 1)})` : ""}`} tone={toneOf(res.absChange)} />
      </div>
    </CalcCard>
  );
}

export function DcaCalc({ price }: { price: number | null }) {
  const [initial, setInitial] = useState(500);
  const [recurring, setRecurring] = useState(100);
  const [freq, setFreq] = useState<DcaFrequency>("weekly");
  const [months, setMonths] = useState(12);
  const [path, setPath] = useState<"flat" | "linear" | "historical">("flat");
  const [start, setStart] = useState(NaN);
  const [target, setTarget] = useState(NaN);
  const [fee, setFee] = useState(0.5);
  usePriceSeed(price, setStart);
  usePriceSeed(price ? price * 1.5 : null, setTarget);
  const hist = useDailyHistory("XRP-USD");
  const n = Math.max(1, Math.min(2000, Math.floor((Math.max(0, months) * 30.4375) / FREQ_DAYS[freq]) + 1));
  const built = useMemo(() => {
    if (path === "historical") {
      const h = historicalPath(hist.data?.candles ?? [], FREQ_DAYS[freq], n);
      return { prices: h.prices, dates: h.dates };
    }
    if (!Number.isFinite(start) || start <= 0) return { prices: [], dates: [] };
    return { prices: path === "flat" ? flatPath(start, n) : linearPath(start, Number.isFinite(target) && target > 0 ? target : start, n), dates: [] as number[] };
  }, [path, hist.data, freq, n, start, target]);
  const r = built.prices.length ? dca({ initial, recurring, prices: built.prices, feePct: fee }) : null;
  const chart = r?.schedule.map((s, i) => ({ i: built.dates[i] ?? i + 1, value: s.value, invested: s.totalInvested })) ?? [];

  return (
    <CalcCard id="dca" title="DCA (dollar-cost averaging)" subtitle="Contributions, average cost and hypothetical value along an assumed price path" badge={<Badge tone="warning">Not a forecast</Badge>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumField label="Initial amount" value={initial} onChange={setInitial} suffix="USD" />
        <NumField label="Recurring amount" value={recurring} onChange={setRecurring} suffix="USD" />
        <div className="flex flex-col gap-1">
          <label htmlFor="dca-freq" className="text-xs font-medium text-fg-secondary">
            Frequency
          </label>
          <select id="dca-freq" className="select" value={freq} onChange={(e) => setFreq(e.target.value as DcaFrequency)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <NumField label="Duration" value={months} onChange={setMonths} suffix="months" step={1} />
        <div className="col-span-2">
          <Seg
            label="Assumed price path"
            value={path}
            onChange={setPath}
            items={[
              { value: "flat", label: "Flat" },
              { value: "linear", label: "Linear to target" },
              { value: "historical", label: "Historical replay" },
            ]}
          />
        </div>
        {path !== "historical" && <NumField label="Start price" value={start} onChange={setStart} />}
        {path === "linear" && <NumField label="End price (assumption)" value={target} onChange={setTarget} />}
        <NumField label="Fee" value={fee} onChange={setFee} suffix="%" />
      </div>
      {path === "historical" && (
        <p className="mt-2 text-2xs text-fg-muted">
          Replays actual XRP daily closes for the last {months} months ({n} purchases), valued at the latest close.{" "}
          {built.dates.length > 0 && `${formatDate(built.dates[0])} → ${formatDate(built.dates[built.dates.length - 1])}. `}
          {hist.loading && !hist.data ? "Loading history…" : hist.error ? "History unavailable." : ""}
        </p>
      )}
      {r ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Result label="Contributions" value={formatMoney(r.contributions)} />
            <Result label="XRP accumulated" value={formatNumber(r.xrp, 2)} />
            <Result label="Average cost" value={formatPrice(r.avgCost)} />
            <Result label="Hypothetical value" value={`${formatMoney(r.value)} (${formatPct(r.pnlPct, 1)})`} tone={toneOf(r.pnl)} big />
          </div>
          {chart.length > 2 && (
            <div className="mt-3">
              <LineChart
                data={chart}
                x="i"
                series={[
                  { key: "value", label: "Hypothetical value" },
                  { key: "invested", label: "Invested", dashed: true },
                ]}
                height={190}
                xFormat={(v) => (path === "historical" ? formatDate(Number(v)) : `#${v}`)}
                yFormat={(v) => formatCompactMoney(v)}
              />
            </div>
          )}
          <p className="mt-2 text-2xs text-fg-muted">
            {path === "historical" ? "Historical replay shows what happened, not what will happen." : "The price path is your assumption, not a forecast."} {r.purchases} purchases · fees {formatMoney(r.fees)}.
          </p>
        </>
      ) : (
        <Invalid text={path === "historical" ? "Waiting for historical data…" : "Enter a start price and amounts."} />
      )}
    </CalcCard>
  );
}

export function MarketCapCalc({ price }: { price: number | null }) {
  const snap = useSnapshot("XRP");
  const supply = snap.data?.circulatingSupply ?? NaN;
  const [x, setX] = useState(NaN);
  const [cap, setCap] = useState(NaN);
  const [customSupply, setCustomSupply] = useState(NaN);
  usePriceSeed(price, setX);
  const s = Number.isFinite(customSupply) && customSupply > 0 ? customSupply : supply;
  const mc = impliedMarketCap(x, s);
  const ip = impliedPrice(cap, s);
  return (
    <CalcCard id="market-cap" title="Market cap & supply valuation" subtitle="Implied market cap at price X = X × circulating supply" badge={<Badge tone="neutral">Educational</Badge>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <NumField label="Price X" value={x} onChange={setX} suffix="USD" />
        <NumField label="Market cap" value={cap} onChange={setCap} suffix="USD" hint="Solve for implied price" />
        <NumField label="Circulating supply (override)" value={customSupply} onChange={setCustomSupply} suffix="XRP" hint={Number.isFinite(supply) ? `CoinGecko: ${formatNumber(supply, 0)}` : snap.loading ? "Loading supply…" : "Supply source unavailable — enter manually"} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Result label="Implied market cap at X" value={mc === null ? "—" : formatCompactMoney(mc)} big />
        <Result label="Implied price at market cap" value={ip === null ? "—" : formatPrice(ip)} />
      </div>
      {snap.data?.marketCapUsd && <p className="mt-2 text-2xs text-fg-muted">Reported market cap now: {formatCompactMoney(snap.data.marketCapUsd)}.</p>}
      <div className="mt-1">
        <SourceLine provenance={snap.data?.provenance} />
      </div>
      <p className="mt-2 text-2xs text-fg-muted">Arithmetic only: it shows what a price would imply, not a price target or a likelihood. Supply can change (e.g. escrow releases).</p>
    </CalcCard>
  );
}

export function ScenarioCalc({ price }: { price: number | null }) {
  const [amount, setAmount] = useState(1000);
  const [cur, setCur] = useState(NaN);
  const [sp, setSp] = useState(NaN);
  usePriceSeed(price, setCur);
  const r = scenario(amount, cur, sp);
  return (
    <CalcCard id="scenario" title="Scenario calculator" subtitle="What your XRP would be worth at a price you choose" badge={<Hypo />}>
      <div className="grid grid-cols-3 gap-3">
        <NumField label="XRP amount" value={amount} onChange={setAmount} />
        <NumField label="Current price" value={cur} onChange={setCur} />
        <NumField label="Scenario price" value={sp} onChange={setSp} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {r ? (
          <>
            <Result label="Value now" value={formatMoney(r.currentValue)} />
            <Result label="Scenario value" value={formatMoney(r.scenarioValue)} big />
            <Result label="Absolute change" value={formatSignedMoney(r.absChange)} tone={toneOf(r.absChange)} />
            <Result label="% change" value={formatPct(r.pctChange, 1)} tone={toneOf(r.pctChange)} />
          </>
        ) : (
          <Invalid text="Enter an amount, a current price and a scenario price." />
        )}
      </div>
      <p className="mt-2 text-2xs text-fg-muted">Hypothetical scenario — the scenario price is your input, not a prediction. Excludes fees and taxes.</p>
    </CalcCard>
  );
}
