"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Crosshair, Lock, Maximize2, Search, Waypoints, ZoomIn, ZoomOut } from "lucide-react";
import { TrustBadge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Field, Stat } from "@/components/ui/Misc";
import { EmptyState, SkeletonRows } from "@/components/ui/States";
import { useAuth } from "@/components/providers/AuthProvider";
import { canUseEntityGraph } from "@/lib/entitlements";
import { formatCompact, formatDate } from "@/lib/format";
import { normalizeXrplAddress } from "@/lib/xrpl/address";
import { getXrplClient } from "@/lib/xrpl/client";
import { buildPaymentGraph, DEFAULT_SIM, initialPositions, stepSimulation, type GraphNode, type SimNode } from "@/lib/xrpl/graph";
import { isExchangeLabel, primaryLabel } from "@/lib/xrpl/labels";
import { normalizeTxEnvelope } from "@/lib/xrpl/tx";
import type { AccountTxResult, TxEnvelope } from "@/lib/xrpl/types";
import { cn } from "@/lib/utils/cn";
import { AccountRef, InlineNote, LabelBadge, XrplErrorState } from "./shared";
import { useLabels } from "./useLabels";

const MIN_AMOUNTS = [0, 1_000, 10_000, 100_000, 1_000_000];
const MAX_EXPANSIONS = 6;
const TX_PER_ACCOUNT = 200;

async function fetchPayments(address: string, limit = TX_PER_ACCOUNT): Promise<TxEnvelope[]> {
  const r = await getXrplClient().request<AccountTxResult>("account_tx", { account: address, ledger_index_min: -1, ledger_index_max: -1, limit, forward: false }, 25_000);
  return (r.transactions ?? []).map(normalizeTxEnvelope).filter((e): e is TxEnvelope => e !== null);
}

export function GraphView() {
  const params = useSearchParams();
  const router = useRouter();
  const seedParam = params.get("seed") ?? "";
  const [input, setInput] = useState(seedParam);
  const [inputErr, setInputErr] = useState<string | null>(null);
  const seedNorm = seedParam ? normalizeXrplAddress(seedParam) : null;
  const seed = seedNorm?.ok ? seedNorm.classic : null;

  return (
    <div className="space-y-4">
      <InlineNote tone="info">Edges show observed payments only — ownership is never inferred. Two addresses connected by payments may be unrelated parties.</InlineNote>
      <Card>
        <CardBody className="pt-4 sm:pt-5">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              const n = normalizeXrplAddress(input);
              if (!n.ok) return setInputErr(n.reason);
              router.push(`/xrpl/graph?seed=${n.classic}`);
            }}
          >
            <Field label="Seed address" htmlFor="graph-seed" error={inputErr} className="flex-1">
              <input id="graph-seed" className="input font-mono text-xs" value={input} onChange={(e) => { setInput(e.target.value); setInputErr(null); }} placeholder="r… or X…" spellCheck={false} />
            </Field>
            <Button type="submit" className="sm:mt-6">
              <Waypoints className="h-4 w-4" /> Build graph
            </Button>
          </form>
        </CardBody>
      </Card>
      {seedParam && !seed && <EmptyState title="Invalid seed address" description={seedNorm && !seedNorm.ok ? seedNorm.reason : undefined} />}
      {seed ? <GraphCanvas key={seed} seed={seed} /> : !seedParam && <EmptyState icon={<Waypoints className="h-5 w-5" />} title="Enter an address to map its payment flows" description="We fetch its most recent transactions from the XRP Ledger and draw every observed payment counterparty." />}
    </div>
  );
}

function GraphCanvas({ seed }: { seed: string }) {
  const { plan } = useAuth();
  const canExpand = canUseEntityGraph(plan);
  const { index: labels } = useLabels();
  const [envs, setEnvs] = useState<TxEnvelope[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [loading, setLoading] = useState<string | null>(seed);
  const [error, setError] = useState<Error | null>(null);
  const [minXrp, setMinXrp] = useState(0);
  const [includeTokens, setIncludeTokens] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(seed);

  const load = useCallback(async (address: string) => {
    setLoading(address);
    setError(null);
    try {
      const list = await fetchPayments(address);
      setEnvs((prev) => {
        const seen = new Set(prev.map((e) => e.hash));
        return [...prev, ...list.filter((e) => !seen.has(e.hash))];
      });
      setExpanded((x) => (x.includes(address) ? x : [...x, address]));
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(null);
    }
  }, []);

  useEffect(() => {
    void load(seed);
  }, [seed, load]);

  const times = envs.map((e) => e.closeTimeMs).filter((t): t is number => t !== null);
  const minT = times.length ? Math.min(...times) : null;
  const maxT = times.length ? Math.max(...times) : null;
  const graph = useMemo(
    () =>
      buildPaymentGraph(
        [seed],
        envs,
        {
          minXrp,
          includeTokens,
          fromMs: from ? Date.parse(from + "T00:00:00Z") : null,
          toMs: to ? Date.parse(to + "T23:59:59Z") : null,
        },
        expanded,
      ),
    [seed, envs, minXrp, includeTokens, from, to, expanded],
  );

  const sel = graph.nodes.find((n) => n.id === selected) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="lg:col-span-8">
        <CardHeader
          title="Payment graph"
          icon={<Waypoints className="h-4 w-4" />}
          subtitle={`${graph.nodes.length} accounts · ${graph.edges.length} flows · from ${envs.length} fetched transactions`}
          actions={<TrustBadge kind="BETA" />}
        />
        <CardBody className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-2xs text-fg-muted">
              Min XRP per payment
              <select className="select h-8 text-xs" value={minXrp} onChange={(e) => setMinXrp(Number(e.target.value))}>
                {MIN_AMOUNTS.map((v) => (
                  <option key={v} value={v}>
                    {v ? `≥ ${formatCompact(v, 0)}` : "Any"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-2xs text-fg-muted">
              From
              <input type="date" className="input h-8 text-xs" value={from} min={minT ? new Date(minT).toISOString().slice(0, 10) : undefined} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-2xs text-fg-muted">
              To
              <input type="date" className="input h-8 text-xs" value={to} min={from || undefined} max={maxT ? new Date(maxT).toISOString().slice(0, 10) : undefined} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="flex items-end gap-2 pb-1.5 text-2xs text-fg-muted">
              <input type="checkbox" checked={includeTokens} onChange={(e) => setIncludeTokens(e.target.checked)} disabled={minXrp > 0} />
              Include token payments
            </label>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
            <input
              className="input h-8 w-full pl-8 text-xs"
              placeholder="Find node by address or label"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const q = search.trim().toLowerCase();
                const hit = graph.nodes.find((n) => n.id.toLowerCase().startsWith(q) || primaryLabel(labels, n.id)?.name.toLowerCase().includes(q));
                if (hit) setSelected(hit.id);
              }}
              aria-label="Find node"
            />
          </div>
          {error && !envs.length ? (
            <XrplErrorState error={error} onRetry={() => void load(seed)} />
          ) : loading === seed && !envs.length ? (
            <SkeletonRows rows={8} />
          ) : graph.edges.length === 0 ? (
            <EmptyState title="No payments match the filters" description="Try a lower minimum amount, a wider date range, or include token payments." className="py-8" />
          ) : (
            <ForceGraph nodes={graph.nodes} edges={graph.edges} selected={selected} onSelect={setSelected} labels={labels} />
          )}
          {minT && maxT && (
            <p className="text-2xs text-fg-muted">
              Fetched window: {formatDate(minT)} – {formatDate(maxT)}. Dates outside this window have no data here (not "no activity").
            </p>
          )}
        </CardBody>
        <CardFooter>
          <span>Node size ∝ XRP volume · arrows show payment direction</span>
          {loading && <span className="text-info">Loading {loading.slice(0, 6)}…</span>}
        </CardFooter>
      </Card>

      <Card className="lg:col-span-4">
        <CardHeader title="Selected account" />
        <CardBody>
          {!sel ? (
            <p className="text-xs text-fg-muted">Tap a node to inspect it.</p>
          ) : (
            <div className="space-y-3">
              <AccountRef address={sel.id} labels={labels} />
              <div className="flex flex-wrap gap-1">
                {(labels.get(sel.id) ?? []).map((l) => (
                  <LabelBadge key={l.source + l.name} label={l} />
                ))}
              </div>
              <div className="divide-y divide-border-subtle/60">
                <Stat label="XRP received (in graph)" value={formatCompact(sel.inXrp)} />
                <Stat label="XRP sent (in graph)" value={formatCompact(sel.outXrp)} />
                <Stat label="Payments (in graph)" value={sel.txCount} />
                <Stat label="Transactions fetched" value={sel.expanded ? `yes (${TX_PER_ACCOUNT} most recent)` : "not expanded"} />
              </div>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={`/xrpl/account/${sel.id}`} variant="secondary" size="sm">
                  Open account
                </ButtonLink>
                {!sel.expanded &&
                  (canExpand ? (
                    <Button size="sm" onClick={() => void load(sel.id)} loading={loading === sel.id} disabled={expanded.length >= MAX_EXPANSIONS + 1}>
                      <Crosshair className="h-3.5 w-3.5" /> Expand
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-2xs text-fg-muted">
                      <Lock className="h-3 w-3" /> Multi-hop expansion is a{" "}
                      <Link href="/pricing" className="text-accent hover:underline">
                        Pro
                      </Link>{" "}
                      feature
                    </span>
                  ))}
              </div>
              {expanded.length >= MAX_EXPANSIONS + 1 && <p className="text-2xs text-fg-muted">Expansion limit reached ({MAX_EXPANSIONS}) to keep the graph readable.</p>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------- SVG renderer ------------------------------- */

function ForceGraph({
  nodes,
  edges,
  selected,
  onSelect,
  labels,
}: {
  nodes: GraphNode[];
  edges: { id: string; source: string; target: string; xrp: number; count: number; tokenPayments: number }[];
  selected: string | null;
  onSelect: (id: string) => void;
  labels: ReturnType<typeof useLabels>["index"];
}) {
  const posRef = useRef<Map<string, SimNode>>(new Map());
  const [, setTick] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const W = 800;
  const H = 560;

  const nodeKey = nodes.map((n) => n.id).join(",");
  useEffect(() => {
    posRef.current = initialPositions(
      nodes.map((n) => n.id),
      posRef.current,
    );
    const seed = nodes.find((n) => n.isSeed);
    if (seed) {
      const p = posRef.current.get(seed.id)!;
      p.x = 0;
      p.y = 0;
      p.fixed = true;
    }
    const simEdges = edges.map((e) => ({ source: e.source, target: e.target, weight: 1 }));
    let steps = 0;
    let raf = 0;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const run = () => {
      let energy = 0;
      const per = reduce ? 400 : 4;
      for (let i = 0; i < per; i++) energy = stepSimulation(posRef.current, simEdges, { ...DEFAULT_SIM, repulsion: nodes.length > 80 ? 1400 : DEFAULT_SIM.repulsion });
      steps += per;
      setTick((t) => t + 1);
      if (energy > 0.05 && steps < 600) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey, edges.length]);

  // wheel zoom (non-passive so the page does not scroll)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(4, Math.max(0.25, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // center on selection
  useEffect(() => {
    if (!selected) return;
    const p = posRef.current.get(selected);
    if (p) setPan({ x: -p.x * zoom, y: -p.y * zoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const maxVol = Math.max(1, ...nodes.map((n) => n.inXrp + n.outXrp));
  const maxEdge = Math.max(1, ...edges.map((e) => e.xrp));
  const radius = (n: GraphNode) => (n.isSeed ? 11 : 4 + 8 * Math.sqrt((n.inXrp + n.outXrp) / maxVol));
  const pairs = new Set(edges.map((e) => `${e.source}>${e.target}`));

  const toSvgDelta = (dx: number) => {
    const el = svgRef.current;
    return el ? dx * (W / el.clientWidth) : dx;
  };

  return (
    <div className="relative overflow-hidden rounded-lg border border-border-subtle bg-bg-secondary">
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <Button variant="secondary" size="xs" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z * 1.25))}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button variant="secondary" size="xs" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="secondary"
          size="xs"
          aria-label="Reset view"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`${-W / 2} ${-H / 2} ${W} ${H}`}
        className="h-[380px] w-full touch-none select-none sm:h-[520px]"
        role="img"
        aria-label={`Payment graph with ${nodes.length} accounts`}
        onPointerDown={(e) => {
          if ((e.target as Element).closest("[data-node]")) return;
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setPan({ x: d.px + toSvgDelta(e.clientX - d.x), y: d.py + toSvgDelta(e.clientY - d.y) });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="rgb(var(--text-muted))" />
          </marker>
        </defs>
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {edges.map((e) => {
            const a = posRef.current.get(e.source);
            const b = posRef.current.get(e.target);
            if (!a || !b) return null;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const bend = pairs.has(`${e.target}>${e.source}`) ? 18 : 0;
            const mx = (a.x + b.x) / 2 - (dy / len) * bend;
            const my = (a.y + b.y) / 2 + (dx / len) * bend;
            const rb = 10;
            const ex = b.x - (dx / len) * rb;
            const ey = b.y - (dy / len) * rb;
            const w = e.xrp ? 0.8 + 3.2 * Math.sqrt(e.xrp / maxEdge) : 0.8;
            const hot = selected && (e.source === selected || e.target === selected);
            return (
              <path
                key={e.id}
                d={`M${a.x},${a.y} Q${mx},${my} ${ex},${ey}`}
                fill="none"
                stroke={hot ? "rgb(var(--accent))" : e.xrp ? "rgb(var(--text-secondary))" : "rgb(var(--info))"}
                strokeOpacity={hot ? 0.9 : 0.35}
                strokeWidth={w / zoom}
                strokeDasharray={e.xrp ? undefined : "3 3"}
                markerEnd="url(#arrow)"
              >
                <title>{`${e.count} payment(s)${e.xrp ? ` · ${e.xrp.toLocaleString("en-US", { maximumFractionDigits: 2 })} XRP` : ""}${e.tokenPayments ? ` · ${e.tokenPayments} token payment(s)` : ""}`}</title>
              </path>
            );
          })}
          {nodes.map((n) => {
            const p = posRef.current.get(n.id);
            if (!p) return null;
            const l = primaryLabel(labels, n.id);
            const ex = isExchangeLabel(l);
            const r = radius(n);
            const isSel = n.id === selected;
            return (
              <g
                key={n.id}
                data-node
                transform={`translate(${p.x} ${p.y})`}
                className="cursor-pointer"
                onClick={() => onSelect(n.id)}
                role="button"
                tabIndex={0}
                aria-label={`${l?.name ?? n.id}`}
                onKeyDown={(e) => e.key === "Enter" && onSelect(n.id)}
              >
                <circle
                  r={r / Math.sqrt(zoom)}
                  fill={n.isSeed ? "rgb(var(--accent))" : ex ? "rgb(var(--info))" : l ? "rgb(var(--warning))" : "rgb(var(--text-muted))"}
                  fillOpacity={n.expanded || n.isSeed ? 1 : 0.75}
                  stroke={isSel ? "rgb(var(--text-primary))" : "rgb(var(--background))"}
                  strokeWidth={(isSel ? 2.5 : 1.2) / zoom}
                />
                {(n.isSeed || l || isSel) && (
                  <text x={(r + 4) / Math.sqrt(zoom)} y={3 / zoom} fontSize={10 / zoom} fill="rgb(var(--text-secondary))" className={cn("pointer-events-none")}>
                    {l?.name ?? `${n.id.slice(0, 6)}…`}
                  </text>
                )}
                <title>{`${l?.name ? `${l.name} — ` : ""}${n.id}`}</title>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="flex flex-wrap gap-3 border-t border-border-subtle px-3 py-1.5 text-2xs text-fg-muted">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent" /> Seed</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-info" /> Labelled exchange</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning" /> Other label</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-fg-muted" /> Unlabelled</span>
        <span>Dashed = token payments</span>
      </div>
    </div>
  );
}
