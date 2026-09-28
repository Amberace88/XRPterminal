"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { GLOSSARY, InfoTip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { estimateOrder, type PlaceResult } from "@/lib/tradelab/engine";
import type { AccountState, MarketSnapshot, OrderInput, OrderType, Side, TimeInForce } from "@/lib/tradelab/types";
import { KV, NumInput, SimTag, pct, px, qtyFmt, usd } from "./common";

type SizeMode = "qty" | "usd";
type BracketMode = "price" | "pct";

const TYPE_ITEMS: { value: OrderType; label: string; title: string }[] = [
  { value: "MARKET", label: "Market", title: "Fill now at the current ask/bid ± simulated slippage" },
  { value: "LIMIT", label: "Limit", title: "Fill at your price or better" },
  { value: "STOP", label: "Stop", title: "Becomes a market order when the stop price is reached" },
  { value: "STOP_LIMIT", label: "Stop-limit", title: "Becomes a limit order when the stop price is reached" },
];

const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

/**
 * Order ticket with live risk preview (spec §92–§98, §104, §105, §273).
 * Every number in the preview comes from the same engine that will simulate the fill.
 */
export function OrderTicket({
  state,
  snapshot,
  now,
  onPlace,
  mode = "live",
  hotkeys = true,
  onDone,
  className,
  initialSide = "BUY",
}: {
  state: AccountState;
  snapshot: MarketSnapshot | null;
  now: () => number;
  onPlace: (input: OrderInput) => PlaceResult | null;
  mode?: "live" | "replay";
  hotkeys?: boolean;
  onDone?: () => void;
  className?: string;
  initialSide?: Side;
}) {
  const toast = useToast();
  const [side, setSide] = useState<Side>(initialSide);
  const [type, setType] = useState<OrderType>("MARKET");
  const [sizeMode, setSizeMode] = useState<SizeMode>("usd");
  const [size, setSize] = useState("1000");
  const [limit, setLimit] = useState("");
  const [stop, setStop] = useState("");
  const [tif, setTif] = useState<TimeInForce>("GTC");
  const [slOn, setSlOn] = useState(true);
  const [slMode, setSlMode] = useState<BracketMode>("pct");
  const [sl, setSl] = useState("2");
  const [tpOn, setTpOn] = useState(false);
  const [tpMode, setTpMode] = useState<BracketMode>("pct");
  const [tp, setTp] = useState("4");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const held = state.position ? Number(state.position.qty) : 0;
  const lastPx = snapshot?.price ?? (state.lastPrice ? Number(state.lastPrice) : null);
  const refForSide = snapshot ? (side === "BUY" ? snapshot.ask ?? snapshot.price : snapshot.bid ?? snapshot.price) : lastPx;
  const basis = type === "LIMIT" || type === "STOP_LIMIT" ? Number(limit) || null : type === "STOP" ? Number(stop) || null : refForSide;

  const qty = useMemo(() => {
    const v = Number(size);
    if (!Number.isFinite(v) || v <= 0) return "";
    if (sizeMode === "qty") return String(Math.floor(v * 1e6) / 1e6);
    if (!basis || basis <= 0) return "";
    return String(Math.floor((v / basis) * 1e6) / 1e6);
  }, [size, sizeMode, basis]);

  const input: OrderInput = useMemo(
    () => ({
      side,
      type,
      qty,
      limitPrice: type === "LIMIT" || type === "STOP_LIMIT" ? limit : null,
      stopPrice: type === "STOP" || type === "STOP_LIMIT" ? stop : null,
      tif: type === "MARKET" ? "GTC" : tif,
      stopLoss: side === "BUY" && slOn && sl ? (slMode === "pct" ? { pct: sl } : { price: sl }) : null,
      takeProfit: side === "BUY" && tpOn && tp ? (tpMode === "pct" ? { pct: tp } : { price: tp }) : null,
      note: note.trim() || null,
    }),
    [side, type, qty, limit, stop, tif, slOn, sl, slMode, tpOn, tp, tpMode, note],
  );

  // live preview (recomputed on each price update)
  const est = useMemo(() => estimateOrder(state, input, snapshot, now()), [state, input, snapshot, now]);
  const replayDeferred = mode === "replay" && est.rejection?.code === "STALE_MARKET_DATA";
  const rejection = replayDeferred ? null : est.rejection;

  // keyboard: B/S side, M/L/T/K type (only when not typing)
  useEffect(() => {
    if (!hotkeys) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "b") setSide("BUY");
      else if (k === "s") setSide("SELL");
      else if (k === "m") setType("MARKET");
      else if (k === "l") setType("LIMIT");
      else if (k === "t") setType("STOP");
      else if (k === "k") setType("STOP_LIMIT");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkeys]);

  const setFraction = (f: number) => {
    if (side === "SELL") {
      setSizeMode("qty");
      setSize(String(Math.floor(held * f * 1e6) / 1e6));
      return;
    }
    const avail = Math.max(0, Number(state.cash)) * f;
    const cost = 1 + state.settings.fees.takerPct / 100 + state.settings.slippage.fixedBps / 10_000;
    setSizeMode("usd");
    setSize(String(Math.floor((avail / cost) * 100) / 100));
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const r = onPlace(input);
      if (!r) return;
      if (r.rejection) {
        toast({ tone: "danger", title: "Simulated order rejected", description: r.rejection.reason });
        return;
      }
      const o = r.state.orders[r.orderId];
      const filled = o?.status === "FILLED" || o?.status === "PARTIALLY_FILLED";
      toast({
        tone: "success",
        title: filled ? `Simulated ${side} filled` : `Simulated ${type.replace("_", "-").toLowerCase()} order placed`,
        description: filled ? `${qtyFmt(o.filledQty)} XRP @ ${px(o.avgFillPrice)} · fee ${usd(Number(o.fees), 4)}` : mode === "replay" && type === "MARKET" ? "Executes at the next candle open." : "Resting in the simulated order book.",
      });
      setNote("");
      onDone?.();
    } finally {
      setSubmitting(false);
    }
  };

  const fillLast = (set: (v: string) => void) => lastPx && set(String(Number(lastPx.toPrecision(6))));
  const noData = !snapshot && mode === "live";

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
      }}
      className={cn("space-y-3", className)}
      aria-label="Simulated order ticket"
    >
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border-subtle bg-bg-secondary p-0.5" role="radiogroup" aria-label="Side">
        {(["BUY", "SELL"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={side === s}
            onClick={() => setSide(s)}
            className={cn(
              "h-9 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              side === s ? (s === "BUY" ? "bg-success/90 text-white" : "bg-danger/90 text-white") : "text-fg-muted hover:text-fg",
            )}
          >
            {s === "BUY" ? "Buy" : "Sell"} <span className="text-2xs font-normal opacity-70">({s[0]})</span>
          </button>
        ))}
      </div>

      <Tabs value={type} onChange={setType} items={TYPE_ITEMS} size="xs" className="w-full justify-between" ariaLabel="Order type" />

      <div className="grid grid-cols-2 gap-2">
        {(type === "STOP" || type === "STOP_LIMIT") && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="tl-stop" className="text-2xs font-medium text-fg-secondary">
                Stop (trigger)
              </label>
              <button type="button" className="text-2xs text-accent hover:underline" onClick={() => fillLast(setStop)}>
                Last
              </button>
            </div>
            <NumInput id="tl-stop" value={stop} onChange={setStop} placeholder="0.0000" suffix="USD" />
          </div>
        )}
        {(type === "LIMIT" || type === "STOP_LIMIT") && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="tl-limit" className="text-2xs font-medium text-fg-secondary">
                Limit price
              </label>
              <button type="button" className="text-2xs text-accent hover:underline" onClick={() => fillLast(setLimit)}>
                Last
              </button>
            </div>
            <NumInput id="tl-limit" value={limit} onChange={setLimit} placeholder="0.0000" suffix="USD" />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label htmlFor="tl-size" className="text-2xs font-medium text-fg-secondary">
            Size
          </label>
          <Tabs
            value={sizeMode}
            onChange={setSizeMode}
            size="xs"
            ariaLabel="Size unit"
            items={[
              { value: "usd", label: "USD" },
              { value: "qty", label: "XRP" },
            ]}
          />
        </div>
        <NumInput id="tl-size" value={size} onChange={setSize} placeholder="0" suffix={sizeMode === "usd" ? "USD" : "XRP"} />
        <div className="flex items-center justify-between gap-2">
          <span className="num text-2xs text-fg-muted">{qty ? `≈ ${qtyFmt(qty)} XRP` : basis ? "—" : "Enter a price to size in USD"}</span>
          <div className="flex gap-1">
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <button key={f} type="button" onClick={() => setFraction(f)} className="rounded border border-border-subtle px-1.5 py-0.5 text-2xs text-fg-muted hover:border-accent/50 hover:text-fg">
                {f * 100}%
              </button>
            ))}
          </div>
        </div>
      </div>

      {type !== "MARKET" && (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="tl-tif" className="text-2xs font-medium text-fg-secondary">
            Time in force
          </label>
          <select id="tl-tif" className="select h-8 w-40 text-xs" value={tif} onChange={(e) => setTif(e.target.value as TimeInForce)}>
            <option value="GTC">GTC — until cancelled</option>
            <option value="DAY">DAY — expires 23:59 UTC</option>
          </select>
        </div>
      )}

      {side === "BUY" && (
        <fieldset className="space-y-2 rounded-lg border border-border-subtle p-2.5">
          <legend className="px-1 text-2xs font-medium text-fg-secondary">Attached exits (OCO)</legend>
          <BracketRow id="sl" label="Stop-loss" on={slOn} setOn={setSlOn} mode={slMode} setMode={setSlMode} value={sl} setValue={setSl} />
          <BracketRow id="tp" label="Take-profit" on={tpOn} setOn={setTpOn} mode={tpMode} setMode={setTpMode} value={tp} setValue={setTp} />
        </fieldset>
      )}

      <div className="rounded-lg border border-border-subtle bg-bg-secondary/60 p-2.5">
        <div className="mb-1 flex items-center justify-between">
          <span className="label">Risk preview</span>
          <SimTag />
        </div>
        <KV label="Est. fill price" value={est.estFillPrice ? px(est.estFillPrice) : "—"} tip="Reference ask/bid (or last price) ± the configured slippage model. Resting limits fill at the limit." />
        <KV label="Slippage" value={`${est.slippageBps.toFixed(1)} bps · ${usd(est.slippageCost)}`} tip={GLOSSARY.slippage} />
        <KV label={`Fee (${est.liquidity.toLowerCase()} ${est.feeRatePct}%)`} value={usd(est.fee)} tip="Simulated fee; maker rate applies to resting limit fills." />
        <KV label="Gross value" value={usd(est.gross)} />
        <KV label={side === "BUY" ? "Net cash out" : "Net cash in"} value={<span className="font-semibold">{usd(est.net)}</span>} />
        {side === "BUY" && (
          <>
            <div className="my-1.5 border-t border-border-subtle" />
            <KV label="Risk to stop" value={est.riskAmount !== null ? `${usd(est.riskAmount)} · ${pct(est.riskPct, 2, false)}` : <span className="text-warning">No stop</span>} tip="(entry − stop) × size, as % of equity" />
            <KV label="Distance to stop" value={est.stopDistancePct !== null ? pct(est.stopDistancePct, 2, false) : "—"} />
            <KV label="Reward : risk" value={est.rewardRisk !== null ? `${est.rewardRisk.toFixed(2)} R` : "—"} tip={GLOSSARY.rMultiple} />
            <KV label="Position after" value={est.positionPctAfter !== null ? `${pct(est.positionPctAfter, 1, false)} of equity` : "—"} />
          </>
        )}
      </div>

      {rejection && Number(qty) > 0 && (
        <p role="alert" className="flex items-start gap-1.5 rounded-md border border-danger/30 bg-danger/10 px-2 py-1.5 text-2xs text-danger">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          {rejection.reason}
        </p>
      )}
      {est.warnings.length > 0 && !rejection && (
        <ul className="space-y-0.5 text-2xs text-warning">
          {est.warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}
      {mode === "replay" && type === "MARKET" && <p className="text-2xs text-fg-muted">Replay: market orders execute at the next candle&apos;s open ± slippage (no lookahead).</p>}

      <input className="input h-8 text-xs" placeholder="Note (optional, saved on the order)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} aria-label="Order note" />

      <Button type="submit" variant={side === "BUY" ? "success" : "danger"} className="w-full" disabled={!!rejection || !Number(qty) || noData} loading={submitting}>
        <ShieldCheck className="h-4 w-4" />
        Place simulated {side === "BUY" ? "buy" : "sell"}
      </Button>
      <p className="text-center text-2xs text-fg-muted">
        Virtual order only — never sent to an exchange. <kbd className="rounded border border-border px-1">⌘/Ctrl ↵</kbd> to submit
        <InfoTip className="ml-1 inline-flex align-middle" text="Hotkeys when not typing: B buy, S sell, M market, L limit, T stop, K stop-limit." />
      </p>
    </form>
  );
}

function BracketRow({
  id,
  label,
  on,
  setOn,
  mode,
  setMode,
  value,
  setValue,
}: {
  id: string;
  label: string;
  on: boolean;
  setOn: (v: boolean) => void;
  mode: BracketMode;
  setMode: (m: BracketMode) => void;
  value: string;
  setValue: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex w-24 shrink-0 items-center gap-1.5 text-2xs text-fg-secondary">
        <input type="checkbox" className="accent-[rgb(var(--accent))]" checked={on} onChange={(e) => setOn(e.target.checked)} />
        {label}
      </label>
      <NumInput id={`tl-${id}`} ariaLabel={`${label} ${mode === "pct" ? "percent" : "price"}`} value={value} onChange={setValue} disabled={!on} suffix={mode === "pct" ? "%" : "USD"} className="flex-1" />
      <Tabs
        value={mode}
        onChange={setMode}
        size="xs"
        ariaLabel={`${label} unit`}
        items={[
          { value: "pct", label: "%" },
          { value: "price", label: "$" },
        ]}
      />
    </div>
  );
}
