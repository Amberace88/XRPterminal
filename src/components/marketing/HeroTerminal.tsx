"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, useReducedMotion } from "framer-motion";
import { CandlestickChart, FlaskConical, History, LayoutDashboard, Network, Telescope, Wallet } from "lucide-react";
import { formatAge, formatNumber, shortenMiddle } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { m } from "./motion";
import { useLiveLedger } from "./useLiveLedger";

/** Deterministic PRNG so the decorative chart renders identically on server and client. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 560;
const H = 190;
const N = 34;

function buildIllustration() {
  const r = mulberry32(20170101);
  const raw: number[] = [];
  let v = 0;
  for (let i = 0; i < N + 1; i++) {
    // gentle down-then-up shape plus noise — purely decorative
    v += (r() - 0.5) * 6 + (i < N * 0.45 ? -1.1 : 1.6);
    raw.push(v);
  }
  const lo = Math.min(...raw);
  const hi = Math.max(...raw);
  const closes = raw.map((x) => 18 + ((x - lo) / (hi - lo || 1)) * 62);
  const plotW = W * 0.74;
  const step = plotW / N;
  const y = (p: number) => H - (p / 100) * H;
  const candles = closes.slice(1).map((c, i) => {
    const o = closes[i];
    const hi = Math.max(o, c) + r() * 5;
    const lo = Math.min(o, c) - r() * 5;
    return { x: i * step + step * 0.2, w: step * 0.6, o: y(o), c: y(c), h: y(hi), l: y(lo), up: c >= o };
  });
  // smooth moving average of closes (window 5), purely decorative
  const ma = closes.slice(1).map((_, i) => {
    const s = closes.slice(Math.max(0, i - 3), i + 2);
    return s.reduce((a, b) => a + b, 0) / s.length;
  });
  const maPath = ma.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step + step / 2).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  const lastX = (N - 1) * step + step / 2;
  const lastY = y(ma[ma.length - 1]);
  const fanEnd = W - 8;
  const fan = {
    outer: `M${lastX},${lastY} L${fanEnd},${lastY - 62} L${fanEnd},${lastY + 58} Z`,
    inner: `M${lastX},${lastY} L${fanEnd},${lastY - 30} L${fanEnd},${lastY + 28} Z`,
    mid: `M${lastX},${lastY} L${fanEnd},${lastY - 2}`,
  };
  return { candles, maPath, fan, lastX };
}

const SIDEBAR = [LayoutDashboard, CandlestickChart, Network, Wallet, History, Telescope, FlaskConical];

/**
 * Hero product preview. The chart is an explicitly labelled ILLUSTRATION (no axes,
 * no values). The ledger feed at the bottom is REAL: validated XRPL ledgers streamed live.
 */
export function HeroTerminal({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const ill = useMemo(buildIllustration, []);
  const ledger = useLiveLedger();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <m.div
      initial={reduce ? false : { opacity: 0, y: 36, rotateX: 10 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1], delay: 0.15 }}
      style={{ transformPerspective: 1200 }}
      className={cn("relative", className)}
    >
      {/* soft accent halo behind the window */}
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2rem] bg-accent/10 blur-3xl" />
      <div className="overflow-hidden rounded-2xl border border-border bg-bg-secondary/90 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8)] ring-1 ring-white/[0.03] backdrop-blur">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-fg-muted/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-fg-muted/30" />
          <span className="h-2.5 w-2.5 rounded-full bg-fg-muted/20" />
          <span className="ml-3 truncate rounded-md border border-border-subtle bg-surface px-2.5 py-0.5 font-mono text-[10px] text-fg-muted">xrpterminal.com/dashboard</span>
        </div>

        <div className="flex">
          <div className="hidden flex-col items-center gap-3 border-r border-border-subtle px-3 py-4 sm:flex" aria-hidden>
            {SIDEBAR.map((Icon, i) => (
              <span key={i} className={cn("grid h-8 w-8 place-items-center rounded-lg", i === 0 ? "bg-accent/15 text-accent" : "text-fg-muted/70")}>
                <Icon className="h-4 w-4" />
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1 space-y-3 p-3 sm:p-4">
            {/* abstract KPI tiles (no values) */}
            <div className="grid grid-cols-3 gap-2" aria-hidden>
              {[0.62, 0.44, 0.78].map((w, i) => (
                <div key={i} className="rounded-lg border border-border-subtle bg-surface p-2.5">
                  <div className="h-1.5 w-10 rounded-full bg-fg-muted/30" />
                  <div className="mt-2 h-3 rounded-full bg-fg/15" style={{ width: `${w * 100}%` }} />
                  <div className="mt-1.5 h-1.5 w-8 rounded-full bg-accent/40" />
                </div>
              ))}
            </div>

            {/* illustrative chart */}
            <div className="relative rounded-xl border border-border-subtle bg-surface p-2">
              <span className="absolute right-2 top-2 z-10 rounded border border-dashed border-border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-fg-muted">
                Illustration
              </span>
              <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Decorative chart illustration — not market data">
                <defs>
                  <linearGradient id="hero-fan" x1="0" x2="1">
                    <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0.04" />
                  </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75].map((f) => (
                  <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="stroke-border-subtle" strokeDasharray="2 6" />
                ))}
                {ill.candles.map((c, i) => (
                  <m.g
                    key={i}
                    initial={reduce ? false : { opacity: 0, scaleY: 0.2 }}
                    animate={{ opacity: 1, scaleY: 1 }}
                    transition={{ delay: 0.35 + i * 0.025, duration: 0.45 }}
                    style={{ transformOrigin: `${c.x + c.w / 2}px ${(c.o + c.c) / 2}px` }}
                  >
                    <line x1={c.x + c.w / 2} x2={c.x + c.w / 2} y1={c.h} y2={c.l} className={c.up ? "stroke-success/70" : "stroke-danger/70"} strokeWidth="1" />
                    <rect x={c.x} width={c.w} y={Math.min(c.o, c.c)} height={Math.max(1.5, Math.abs(c.o - c.c))} rx="1" className={c.up ? "fill-success/80" : "fill-danger/80"} />
                  </m.g>
                ))}
                <m.path
                  d={ill.maPath}
                  fill="none"
                  className="stroke-accent-strong"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 0.5, duration: 1.4, ease: "easeInOut" }}
                />
                <m.g initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6, duration: 0.8 }}>
                  <line x1={ill.lastX} x2={ill.lastX} y1="6" y2={H - 6} className="stroke-border" strokeDasharray="3 4" />
                  <path d={ill.fan.outer} fill="url(#hero-fan)" opacity="0.6" />
                  <path d={ill.fan.inner} fill="url(#hero-fan)" />
                  <path d={ill.fan.mid} className="stroke-accent" strokeWidth="1.2" strokeDasharray="4 4" fill="none" />
                </m.g>
              </svg>
              <div className="flex items-center justify-between px-1 pb-0.5 pt-1 text-[10px] text-fg-muted">
                <span>History</span>
                <span className="text-accent-strong/80">Scenario range →</span>
              </div>
            </div>

            {/* REAL live ledger feed */}
            <div className="rounded-xl border border-border-subtle bg-surface">
              <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
                <span className="text-[11px] font-semibold text-fg">Validated ledgers</span>
                {ledger.ledgers.length ? (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-success">
                    <span className="h-1.5 w-1.5 animate-pulse2 rounded-full bg-success" /> Live · XRPL mainnet
                  </span>
                ) : (
                  <span className="text-[10px] text-fg-muted">{ledger.conn === "failed" ? "Stream unavailable" : "Connecting…"}</span>
                )}
              </div>
              <ul className="h-[104px] overflow-hidden px-3 py-1.5 font-mono text-[11px]" aria-label="Latest validated XRPL ledgers">
                {ledger.ledgers.length === 0 && ledger.conn !== "failed" &&
                  [0, 1, 2, 3].map((i) => <li key={i} className="my-2 h-3 animate-pulse rounded bg-surface-hover" style={{ width: `${88 - i * 9}%` }} />)}
                {ledger.conn === "failed" && ledger.ledgers.length === 0 && (
                  <li className="py-6 text-center font-sans text-xs text-fg-muted">Could not reach public XRPL servers.</li>
                )}
                <AnimatePresence initial={false}>
                  {ledger.ledgers.slice(0, 4).map((l) => (
                    <m.li
                      key={l.index}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35 }}
                      className="flex items-center justify-between gap-3 py-[3px]"
                    >
                      <span className="num text-fg">#{formatNumber(l.index, 0)}</span>
                      <span className="hidden truncate text-fg-muted sm:inline">{shortenMiddle(l.hash, 6, 6)}</span>
                      <span className="num text-fg-secondary">{l.txnCount != null ? `${l.txnCount} tx` : "—"}</span>
                      <span className="num w-14 text-right text-fg-muted">{formatAge(l.closeTime, now)}</span>
                    </m.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </m.div>
  );
}
