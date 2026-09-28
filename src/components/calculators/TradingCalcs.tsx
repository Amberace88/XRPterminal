"use client";

import { useState } from "react";
import { formatMoney, formatNumber, formatPct, formatPrice, formatSignedMoney } from "@/lib/format";
import { toneOf } from "@/components/ui/MetricCard";
import { applySlippage, percentChange, pnl, positionSize, recoveryNeeded, riskReward, roundTripFees, slippage } from "@/lib/calculators";
import { CalcCard, Invalid, NumField, Result, Seg, usePriceSeed } from "./primitives";

export function PnlCalc({ price }: { price: number | null }) {
  const [side, setSide] = useState<"long" | "short">("long");
  const [entry, setEntry] = useState(NaN);
  const [exit, setExit] = useState(NaN);
  const [qty, setQty] = useState(1000);
  const [fee, setFee] = useState(0.1);
  usePriceSeed(price, setEntry);
  usePriceSeed(price ? price * 1.1 : null, setExit);
  const r = pnl({ side, entry, exit, qty, feePct: fee });
  return (
    <CalcCard id="pnl" title="Profit / loss" subtitle="Realized P&L including trading fees">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Seg label="Side" value={side} onChange={setSide} items={[{ value: "long", label: "Long" }, { value: "short", label: "Short" }]} />
        <NumField label="Entry price" value={entry} onChange={setEntry} suffix="USD" />
        <NumField label="Exit price" value={exit} onChange={setExit} suffix="USD" />
        <NumField label="Quantity" value={qty} onChange={setQty} suffix="XRP" />
        <NumField label="Fee per side" value={fee} onChange={setFee} suffix="%" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {r ? (
          <>
            <Result label="Net P&L" value={formatSignedMoney(r.net)} tone={toneOf(r.net)} big />
            <Result label="Return" value={formatPct(r.returnPct)} tone={toneOf(r.returnPct)} />
            <Result label="Fees" value={formatMoney(r.fees)} />
            <Result label="Break-even exit" value={formatPrice(r.breakEvenExit)} />
          </>
        ) : (
          <Invalid />
        )}
      </div>
    </CalcCard>
  );
}

export function PercentCalc({ price }: { price: number | null }) {
  const [from, setFrom] = useState(NaN);
  const [to, setTo] = useState(NaN);
  const [loss, setLoss] = useState(50);
  usePriceSeed(price, setFrom);
  const ch = percentChange(from, to);
  const rec = recoveryNeeded(loss);
  return (
    <CalcCard id="percent" title="Percentage change" subtitle="Change between two values, and the gain needed to recover a loss">
      <div className="grid grid-cols-2 gap-3">
        <NumField label="From" value={from} onChange={setFrom} />
        <NumField label="To" value={to} onChange={setTo} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Result label="Change" value={ch === null ? "—" : formatPct(ch)} tone={toneOf(ch)} big />
        <Result label="Difference" value={Number.isFinite(to - from) ? formatNumber(to - from, 6) : "—"} />
      </div>
      <div className="mt-4 grid grid-cols-2 items-end gap-3 border-t border-border-subtle pt-3">
        <NumField label="After a loss of" value={loss} onChange={setLoss} suffix="%" />
        <Result label="Gain needed to recover" value={rec === null ? "—" : formatPct(rec, 1)} />
      </div>
    </CalcCard>
  );
}

export function PositionSizeCalc({ price }: { price: number | null }) {
  const [account, setAccount] = useState(10_000);
  const [risk, setRisk] = useState(1);
  const [entry, setEntry] = useState(NaN);
  const [stop, setStop] = useState(NaN);
  const [fee, setFee] = useState(0.1);
  usePriceSeed(price, setEntry);
  usePriceSeed(price ? price * 0.95 : null, setStop);
  const r = positionSize({ accountSize: account, riskPct: risk, entry, stop, feePct: fee });
  return (
    <CalcCard id="position-size" title="Position size" subtitle="Size a position so that hitting the stop loses a fixed % of the account">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <NumField label="Account size" value={account} onChange={setAccount} suffix="USD" />
        <NumField label="Risk per trade" value={risk} onChange={setRisk} suffix="%" />
        <NumField label="Fee per side" value={fee} onChange={setFee} suffix="%" />
        <NumField label="Entry" value={entry} onChange={setEntry} suffix="USD" />
        <NumField label="Stop" value={stop} onChange={setStop} suffix="USD" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {r ? (
          <>
            <Result label={`Size (${r.side})`} value={`${formatNumber(r.qty, 2)} XRP`} big />
            <Result label="Position value" value={formatMoney(r.positionValue)} />
            <Result label="Risk amount" value={formatMoney(r.riskAmount)} />
            <Result label="Stop distance" value={formatPct(r.stopDistancePct, 2, false)} />
          </>
        ) : (
          <Invalid text="Enter account, risk %, and different entry/stop prices." />
        )}
      </div>
      {r && r.accountShare > 100 && <p className="mt-2 text-2xs text-warning">Position exceeds the account ({r.accountShare.toFixed(0)}%) — it would require leverage.</p>}
    </CalcCard>
  );
}

export function RiskRewardCalc({ price }: { price: number | null }) {
  const [entry, setEntry] = useState(NaN);
  const [stop, setStop] = useState(NaN);
  const [target, setTarget] = useState(NaN);
  usePriceSeed(price, setEntry);
  usePriceSeed(price ? price * 0.95 : null, setStop);
  usePriceSeed(price ? price * 1.15 : null, setTarget);
  const r = riskReward(entry, stop, target);
  return (
    <CalcCard id="risk-reward" title="Risk / reward" subtitle="Reward-to-risk ratio and the win rate needed to break even">
      <div className="grid grid-cols-3 gap-3">
        <NumField label="Entry" value={entry} onChange={setEntry} />
        <NumField label="Stop" value={stop} onChange={setStop} />
        <NumField label="Target" value={target} onChange={setTarget} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {r ? (
          <>
            <Result label="R:R" value={`1 : ${r.ratio.toFixed(2)}`} big />
            <Result label="Break-even win rate" value={formatPct(r.breakevenWinRate, 1, false)} />
            <Result label="Risk" value={formatPct(-r.riskPct, 2)} tone="down" />
            <Result label="Reward" value={formatPct(r.rewardPct, 2)} tone="up" />
          </>
        ) : (
          <Invalid text="Target must be beyond entry in the trade direction (stop below entry = long)." />
        )}
      </div>
    </CalcCard>
  );
}

export function FeesCalc({ price }: { price: number | null }) {
  const [qty, setQty] = useState(1000);
  const [entry, setEntry] = useState(NaN);
  const [exit, setExit] = useState(NaN);
  const [entryFee, setEntryFee] = useState(0.4);
  const [exitFee, setExitFee] = useState(0.4);
  usePriceSeed(price, setEntry);
  usePriceSeed(price, setExit);
  const r = roundTripFees(qty, entry, exit, entryFee, exitFee);
  return (
    <CalcCard id="fees" title="Trading fees" subtitle="Round-trip fee cost and the price move needed to cover it">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <NumField label="Quantity" value={qty} onChange={setQty} suffix="XRP" />
        <NumField label="Entry price" value={entry} onChange={setEntry} />
        <NumField label="Exit price" value={exit} onChange={setExit} />
        <NumField label="Entry fee" value={entryFee} onChange={setEntryFee} suffix="%" hint="e.g. taker fee" />
        <NumField label="Exit fee" value={exitFee} onChange={setExitFee} suffix="%" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {r ? (
          <>
            <Result label="Total fees" value={formatMoney(r.total, "USD", 4)} big />
            <Result label="Entry fee" value={formatMoney(r.entryFee, "USD", 4)} />
            <Result label="Exit fee" value={formatMoney(r.exitFee, "USD", 4)} />
            <Result label="Move to break even" value={formatPct(r.breakEvenMovePct, 3, false)} />
          </>
        ) : (
          <Invalid />
        )}
      </div>
    </CalcCard>
  );
}

export function SlippageCalc({ price }: { price: number | null }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [expected, setExpected] = useState(NaN);
  const [fill, setFill] = useState(NaN);
  const [qty, setQty] = useState(5000);
  const [bps, setBps] = useState(10);
  usePriceSeed(price, setExpected);
  usePriceSeed(price ? price * 1.002 : null, setFill);
  const r = slippage(side, expected, fill, qty);
  const est = applySlippage(side, expected, bps);
  return (
    <CalcCard id="slippage" title="Slippage" subtitle="Difference between expected and actual fill price">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Seg label="Side" value={side} onChange={setSide} items={[{ value: "buy", label: "Buy" }, { value: "sell", label: "Sell" }]} />
        <NumField label="Expected price" value={expected} onChange={setExpected} />
        <NumField label="Fill price" value={fill} onChange={setFill} />
        <NumField label="Quantity" value={qty} onChange={setQty} suffix="XRP" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {r ? (
          <>
            <Result label="Slippage" value={formatPct(r.slippagePct, 3)} tone={r.slippagePct > 0 ? "down" : r.slippagePct < 0 ? "up" : "neutral"} big />
            <Result label={r.cost >= 0 ? "Cost" : "Price improvement"} value={formatMoney(Math.abs(r.cost), "USD", 4)} />
          </>
        ) : (
          <Invalid />
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 items-end gap-3 border-t border-border-subtle pt-3">
        <NumField label="Assumed slippage" value={bps} onChange={setBps} suffix="bps" hint="1 bp = 0.01%" />
        <Result label={`Estimated ${side} fill`} value={est === null ? "—" : formatPrice(est)} />
      </div>
      <p className="mt-2 text-2xs text-fg-muted">Positive slippage = worse than expected. Real slippage depends on order-book depth at the time of the trade.</p>
    </CalcCard>
  );
}
