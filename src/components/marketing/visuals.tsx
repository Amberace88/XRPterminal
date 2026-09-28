"use client";

import { useMemo } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowUpRight, Bell, BellRing, Scale, ShieldAlert, Waves } from "lucide-react";
import { ClaimLabel } from "@/components/ui/Misc";
import { TrustBadge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import { m } from "./motion";

/**
 * Decorative product illustrations for the landing page. They contain NO market values,
 * NO addresses and NO performance numbers — only abstract shapes and generic labels —
 * and every frame is tagged "Illustration".
 */

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Decorative random walk rescaled into [lo, hi] (percent of the drawing height). */
function walk(n: number, seed: number, drift = 0.02, vol = 6, lo = 15, hi = 85) {
  const r = rng(seed);
  const raw: number[] = [];
  let v = 0;
  for (let i = 0; i < n; i++) {
    v += (r() - 0.5 + drift) * vol;
    raw.push(v);
  }
  const min = Math.min(...raw);
  const max = Math.max(...raw);
  return raw.map((x) => lo + ((x - min) / (max - min || 1)) * (hi - lo));
}

const toPath = (pts: number[], w: number, h: number) =>
  pts.map((p, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * w).toFixed(1)},${(h - (p / 100) * h).toFixed(1)}`).join(" ");

export function VisualFrame({ children, className, label = "Illustration" }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-border-subtle bg-gradient-to-b from-surface to-bg-secondary p-4 shadow-card sm:p-5", className)}>
      <span className="absolute right-3 top-3 z-10 rounded border border-dashed border-border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-fg-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

function Bar({ w, className }: { w: number; className?: string }) {
  return <div className={cn("h-2 rounded-full bg-fg/10", className)} style={{ width: `${w}%` }} />;
}

function DrawPath({ d, className, delay = 0, width = 1.8, dash }: { d: string; className?: string; delay?: number; width?: number; dash?: string }) {
  const reduce = useReducedMotion();
  return (
    <m.path
      d={d}
      fill="none"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dash}
      className={className}
      initial={reduce ? false : { pathLength: 0, opacity: 0 }}
      whileInView={{ pathLength: 1, opacity: 1 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 1.6, delay, ease: "easeInOut" }}
    />
  );
}

/* ---------------------------------------------------------------- market */
export function VisualMarket() {
  const pts = useMemo(() => walk(60, 11, 0.03, 7), []);
  const W = 460;
  const H = 150;
  const line = toPath(pts, W, H);
  return (
    <VisualFrame>
      <div className="mb-4 flex flex-wrap items-center gap-3 pr-20 text-2xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" /> Live
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-info">
          <span className="h-1.5 w-1.5 rounded-full bg-info" /> Recent
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-warning">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Stale
        </span>
        <span className="text-fg-muted">— every number carries its freshness</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden>
        <defs>
          <linearGradient id="vm-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.25" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#vm-area)" />
        <DrawPath d={line} className="stroke-accent" />
      </svg>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {["Venue", "Venue", "Venue"].map((v, i) => (
          <div key={i} className="rounded-lg border border-border-subtle bg-bg-secondary/70 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-fg-muted">
                {v} {String.fromCharCode(65 + i)}
              </span>
              <span className={cn("h-1.5 w-1.5 rounded-full", i === 2 ? "bg-warning" : i === 1 ? "bg-info" : "bg-success")} />
            </div>
            <Bar w={70 - i * 12} className="mt-2" />
          </div>
        ))}
      </div>
    </VisualFrame>
  );
}

/* ---------------------------------------------------------------- xrpl */
export function VisualXrpl() {
  const reduce = useReducedMotion();
  const nodes = useMemo(() => {
    const r = rng(7);
    const center = { x: 230, y: 120, r: 16 };
    const ring = Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2 + r() * 0.3;
      const d = 70 + r() * 45;
      return { x: 230 + Math.cos(a) * d * 1.6, y: 120 + Math.sin(a) * d * 0.85, r: 4 + r() * 7 };
    });
    return { center, ring };
  }, []);
  return (
    <VisualFrame>
      <svg viewBox="0 0 460 240" className="h-auto w-full" aria-hidden>
        {nodes.ring.map((n, i) => (
          <line key={`e${i}`} x1={nodes.center.x} y1={nodes.center.y} x2={n.x} y2={n.y} className="stroke-border" strokeWidth="1" />
        ))}
        {nodes.ring.slice(0, 6).map((n, i) => {
          const b = nodes.ring[(i + 3) % nodes.ring.length];
          return <line key={`x${i}`} x1={n.x} y1={n.y} x2={b.x} y2={b.y} className="stroke-border-subtle" strokeWidth="1" strokeDasharray="3 5" />;
        })}
        {!reduce &&
          nodes.ring.slice(0, 5).map((n, i) => (
            <m.circle
              key={`p${i}`}
              r="2.5"
              className="fill-accent-strong"
              initial={{ cx: nodes.center.x, cy: nodes.center.y, opacity: 0 }}
              animate={{ cx: [nodes.center.x, n.x], cy: [nodes.center.y, n.y], opacity: [0, 1, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.55, ease: "easeInOut", repeatDelay: 1.2 }}
            />
          ))}
        {nodes.ring.map((n, i) => (
          <circle key={`n${i}`} cx={n.x} cy={n.y} r={n.r} className={i % 3 === 0 ? "fill-accent/30 stroke-accent/60" : "fill-surface-hover stroke-border"} strokeWidth="1" />
        ))}
        <circle cx={nodes.center.x} cy={nodes.center.y} r={nodes.center.r + 8} className="fill-accent/10" />
        <circle cx={nodes.center.x} cy={nodes.center.y} r={nodes.center.r} className="fill-accent/40 stroke-accent" strokeWidth="1.5" />
      </svg>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
        {["Account", "Payment", "Offer", "Escrow", "AMM"].map((t) => (
          <span key={t} className="rounded-md border border-border-subtle bg-bg-secondary px-2 py-0.5 text-fg-muted">
            {t}
          </span>
        ))}
      </div>
    </VisualFrame>
  );
}

/* ---------------------------------------------------------------- portfolio */
export function VisualPortfolio() {
  const segs = [0.46, 0.24, 0.18, 0.12];
  const C = 2 * Math.PI * 52;
  let acc = 0;
  const cls = ["stroke-accent", "stroke-accent-strong/70", "stroke-info/60", "stroke-fg-muted/50"];
  return (
    <VisualFrame>
      <div className="flex flex-col items-center gap-5 sm:flex-row">
        <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0 -rotate-90" aria-hidden>
          <circle cx="70" cy="70" r="52" className="fill-none stroke-surface-hover" strokeWidth="16" />
          {segs.map((s, i) => {
            const dash = `${s * C - 3} ${C}`;
            const off = -acc * C;
            acc += s;
            return (
              <m.circle
                key={i}
                cx="70"
                cy="70"
                r="52"
                className={cn("fill-none", cls[i])}
                strokeWidth="16"
                strokeDasharray={dash}
                strokeDashoffset={off}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.15 * i, duration: 0.6 }}
              />
            );
          })}
        </svg>
        <div className="w-full space-y-3">
          {segs.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", ["bg-accent", "bg-accent-strong/70", "bg-info/60", "bg-fg-muted/50"][i])} />
              <Bar w={30 + s * 90} />
              <div className="ml-auto h-2 w-10 rounded-full bg-fg/10" />
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-secondary/70 px-3 py-2 text-[10px] text-fg-muted">
            <ShieldAlert className="h-3.5 w-3.5 text-success" /> Read-only · no keys · no signing
          </div>
        </div>
      </div>
    </VisualFrame>
  );
}

/* ---------------------------------------------------------------- ai */
export function VisualAi() {
  const rows: { kind: "FACT" | "ANALYSIS" | "SCENARIO" | "SPECULATION"; w: number[] }[] = [
    { kind: "FACT", w: [92, 64] },
    { kind: "ANALYSIS", w: [86, 72] },
    { kind: "SCENARIO", w: [78] },
    { kind: "SPECULATION", w: [58] },
  ];
  return (
    <VisualFrame>
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-24 rounded-full bg-fg/20" />
        <span className="h-2 w-12 rounded-full bg-fg/10" />
      </div>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <m.div
            key={r.kind}
            className="rounded-lg border border-border-subtle bg-bg-secondary/60 p-3"
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.12 * i, duration: 0.5 }}
          >
            <ClaimLabel kind={r.kind} />
            <div className="mt-2 space-y-1.5">
              {r.w.map((w, j) => (
                <Bar key={j} w={w} />
              ))}
            </div>
          </m.div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[10px] text-fg-muted">
        Sources
        {[1, 2, 3].map((n) => (
          <span key={n} className="inline-flex items-center gap-0.5 rounded border border-border-subtle px-1.5 py-px">
            [{n}] <ArrowUpRight className="h-2.5 w-2.5" />
          </span>
        ))}
      </div>
    </VisualFrame>
  );
}

/* ---------------------------------------------------------------- historical */
export function VisualHistorical() {
  const W = 460;
  const H = 170;
  const cycles = useMemo(() => [walk(70, 3, 0.05, 7, 10, 90), walk(70, 5, 0.04, 6, 12, 70), walk(70, 9, 0.03, 5, 14, 55)], []);
  const dd = useMemo(() => walk(70, 13, -0.01, 4, 40, 100), []);
  return (
    <VisualFrame>
      <div className="mb-2 flex gap-3 pr-20 text-[10px] text-fg-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-0.5 w-4 bg-accent" /> Cycle A
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-0.5 w-4 bg-accent-strong/60" /> Cycle B
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-0.5 w-4 bg-info/50" /> Cycle C
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden>
        {cycles.map((c, i) => (
          <DrawPath key={i} d={toPath(c, W, H)} delay={i * 0.3} className={["stroke-accent", "stroke-accent-strong/60", "stroke-info/50"][i]} width={i ? 1.4 : 2} />
        ))}
      </svg>
      <div className="mt-3 border-t border-border-subtle pt-3">
        <span className="label">Drawdown from peak</span>
        <svg viewBox={`0 0 ${W} 50`} className="mt-1 h-auto w-full" aria-hidden>
          <path d={`M0,0 ${dd.map((v, i) => `L${((i / (dd.length - 1)) * W).toFixed(1)},${((100 - v) / 100) * 50}`).join(" ")} L${W},0 Z`} className="fill-danger/20" />
        </svg>
      </div>
    </VisualFrame>
  );
}

/* ---------------------------------------------------------------- future */
export function VisualFuture() {
  const W = 460;
  const H = 190;
  const hist = useMemo(() => walk(40, 21, 0.01, 5, 30, 62), []);
  const x0 = W * 0.52;
  const last = hist[hist.length - 1];
  const y = (p: number) => H - (p / 100) * H;
  const histPath = hist.map((p, i) => `${i ? "L" : "M"}${((i / (hist.length - 1)) * x0).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  const band = (spread: number) => `M${x0},${y(last)} C${x0 + 80},${y(last + spread * 0.4)} ${W - 60},${y(last + spread)} ${W},${y(last + spread)} L${W},${y(last - spread * 0.85)} C${W - 60},${y(last - spread * 0.85)} ${x0 + 80},${y(last - spread * 0.35)} ${x0},${y(last)} Z`;
  return (
    <VisualFrame>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-5 h-auto w-full" aria-hidden>
        <line x1={x0} x2={x0} y1="0" y2={H} className="stroke-border" strokeDasharray="3 4" />
        <m.path d={band(38)} className="fill-accent/10" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.8, duration: 0.8 }} />
        <m.path d={band(20)} className="fill-accent/20" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 1.0, duration: 0.8 }} />
        <DrawPath d={histPath} className="stroke-fg-secondary" />
        <DrawPath d={`M${x0},${y(last)} C${x0 + 80},${y(last + 2)} ${W - 60},${y(last + 3)} ${W},${y(last + 3)}`} className="stroke-accent" dash="5 5" delay={1.2} />
        {[
          ["P90", last + 38],
          ["P75", last + 20],
          ["P50", last + 3],
          ["P25", last - 17],
          ["P10", last - 32],
        ].map(([l, v]) => (
          <text key={l as string} x={W - 4} y={y(v as number) + 3} textAnchor="end" className="fill-fg-muted text-[9px]">
            {l}
          </text>
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-fg-muted">
        <span className="rounded-md border border-border-subtle px-2 py-0.5">Model · version</span>
        <span className="rounded-md border border-border-subtle px-2 py-0.5">Published · timestamp</span>
        <span className="rounded-md border border-border-subtle px-2 py-0.5">Invalidation conditions</span>
      </div>
    </VisualFrame>
  );
}

/* ---------------------------------------------------------------- trade lab */
export function VisualTradeLab() {
  const W = 460;
  const H = 110;
  const eq = useMemo(() => walk(50, 31, 0.06, 5, 10, 90), []);
  return (
    <VisualFrame>
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-warning/50 bg-warning/[0.07] px-2 py-1 text-[10px] font-semibold tracking-wide text-warning">
        SIMULATED / DEMO — virtual capital only
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
        <div className="space-y-2 rounded-lg border border-border-subtle bg-bg-secondary/60 p-3">
          <div className="grid grid-cols-2 gap-1 rounded-md bg-surface p-0.5 text-center text-[10px] font-semibold">
            <span className="rounded bg-success/15 py-1 text-success">Buy</span>
            <span className="py-1 text-fg-muted">Sell</span>
          </div>
          {["Order type", "Size", "Stop loss", "Take profit"].map((f) => (
            <div key={f}>
              <span className="text-[10px] text-fg-muted">{f}</span>
              <div className="mt-0.5 h-6 rounded-md border border-border-subtle bg-surface" />
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-border-subtle bg-bg-secondary/60 p-3">
          <span className="label">Equity curve</span>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-auto w-full" aria-hidden>
            <DrawPath d={toPath(eq, W, H)} className="stroke-accent" />
            <line x1="0" x2={W} y1={H * 0.6} y2={H * 0.6} className="stroke-fg-muted/40" strokeDasharray="4 4" />
          </svg>
          <div className="mt-1 flex items-center gap-3 text-[10px] text-fg-muted">
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-3 bg-accent" /> Strategy
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-3 border-t border-dashed border-fg-muted" /> Buy & hold
            </span>
          </div>
        </div>
      </div>
    </VisualFrame>
  );
}

/* ---------------------------------------------------------------- social */
export function VisualSocial() {
  const kinds = ["VERIFIED", "UNVERIFIED", "SIMULATED"] as const;
  return (
    <VisualFrame>
      <div className="space-y-2.5">
        {kinds.map((k, i) => (
          <m.div
            key={k}
            className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-secondary/60 p-3"
            initial={{ opacity: 0, x: 12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.12, duration: 0.5 }}
          >
            <span className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-surface-hover to-border" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Bar w={40 + i * 8} />
              <Bar w={24} className="bg-fg/5" />
            </div>
            <TrustBadge kind={k} />
          </m.div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-fg-muted">Performance provenance is always shown — verified, unverified and simulated never look alike.</p>
    </VisualFrame>
  );
}

/* ---------------------------------------------------------------- alerts */
export function VisualAlerts() {
  const items = [
    { icon: Bell, title: "Price crossed your level", tone: "text-accent" },
    { icon: Waves, title: "Large transfer above your threshold", tone: "text-info" },
    { icon: Scale, title: "Market regime changed", tone: "text-warning" },
  ];
  return (
    <VisualFrame label="Example alert types">
      <div className="relative space-y-2.5 pt-4">
        {items.map((it, i) => (
          <m.div
            key={it.title}
            className="flex items-start gap-3 rounded-xl border border-border bg-surface-elevated p-3 shadow-card"
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.25, duration: 0.45 }}
          >
            <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-bg-secondary", it.tone)}>
              <it.icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-fg">{it.title}</p>
              <div className="mt-1.5 h-1.5 w-2/3 rounded-full bg-fg/10" />
            </div>
          </m.div>
        ))}
        <div className="flex items-center gap-2 pt-1 text-[10px] text-fg-muted">
          <BellRing className="h-3 w-3" /> Cooldowns & de-duplication prevent alert spam
        </div>
      </div>
    </VisualFrame>
  );
}

export const VISUALS = {
  market: VisualMarket,
  xrpl: VisualXrpl,
  portfolio: VisualPortfolio,
  ai: VisualAi,
  historical: VisualHistorical,
  future: VisualFuture,
  tradelab: VisualTradeLab,
  social: VisualSocial,
  alerts: VisualAlerts,
} as const;
export type VisualId = keyof typeof VISUALS;
