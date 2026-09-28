import { deliveredAmount } from "./amount";
import type { TxEnvelope } from "./types";

/**
 * Entity graph from OBSERVED payments only (spec §33). Edges aggregate payments A→B.
 * Ownership is never inferred; clustering/heuristics are intentionally absent.
 */
export interface GraphNode {
  id: string;
  isSeed: boolean;
  inXrp: number;
  outXrp: number;
  txCount: number;
  expanded: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  count: number;
  xrp: number;
  tokenPayments: number;
  firstMs: number | null;
  lastMs: number | null;
}

export interface GraphFilter {
  minXrp?: number;
  fromMs?: number | null;
  toMs?: number | null;
  includeTokens?: boolean;
}

export function buildPaymentGraph(seeds: string[], envs: TxEnvelope[], filter: GraphFilter = {}, expanded: string[] = []): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const { minXrp = 0, fromMs = null, toMs = null, includeTokens = true } = filter;
  const edges = new Map<string, GraphEdge>();
  const seen = new Set<string>();
  for (const e of envs) {
    if (seen.has(e.hash)) continue;
    seen.add(e.hash);
    if (e.tx.TransactionType !== "Payment" || e.meta?.TransactionResult !== "tesSUCCESS") continue;
    const to = e.tx.Destination;
    if (!to || to === e.tx.Account) continue;
    if (fromMs !== null && (e.closeTimeMs ?? 0) < fromMs) continue;
    if (toMs !== null && (e.closeTimeMs ?? Infinity) > toMs) continue;
    const { amount } = deliveredAmount(e.tx, e.meta);
    if (!amount) continue;
    const isXrp = amount.kind === "XRP";
    if (!isXrp && !includeTokens) continue;
    if (isXrp && amount.num < minXrp) continue;
    if (!isXrp && minXrp > 0) continue; // tokens cannot be compared to an XRP threshold
    const id = `${e.tx.Account}>${to}`;
    const g = edges.get(id) ?? { id, source: e.tx.Account, target: to, count: 0, xrp: 0, tokenPayments: 0, firstMs: null, lastMs: null };
    g.count++;
    if (isXrp) g.xrp += amount.num;
    else g.tokenPayments++;
    const t = e.closeTimeMs;
    if (t !== null) {
      g.firstMs = g.firstMs === null ? t : Math.min(g.firstMs, t);
      g.lastMs = g.lastMs === null ? t : Math.max(g.lastMs, t);
    }
    edges.set(id, g);
  }
  const nodes = new Map<string, GraphNode>();
  const node = (id: string) => {
    let n = nodes.get(id);
    if (!n) {
      n = { id, isSeed: seeds.includes(id), inXrp: 0, outXrp: 0, txCount: 0, expanded: expanded.includes(id) || seeds.includes(id) };
      nodes.set(id, n);
    }
    return n;
  };
  for (const s of seeds) node(s);
  for (const g of edges.values()) {
    const a = node(g.source);
    const b = node(g.target);
    a.outXrp += g.xrp;
    b.inXrp += g.xrp;
    a.txCount += g.count;
    b.txCount += g.count;
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/* ----------------------------- Force simulation ----------------------------- */

export interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed?: boolean;
  mass: number;
}

export interface SimParams {
  repulsion: number;
  springLength: number;
  springK: number;
  gravity: number;
  damping: number;
}

export const DEFAULT_SIM: SimParams = { repulsion: 2400, springLength: 90, springK: 0.02, gravity: 0.012, damping: 0.82 };

/** Deterministic initial placement on a spiral (no randomness → stable layouts & testable). */
export function initialPositions(ids: string[], prev?: Map<string, SimNode>): Map<string, SimNode> {
  const out = new Map<string, SimNode>();
  ids.forEach((id, i) => {
    const p = prev?.get(id);
    if (p) {
      out.set(id, { ...p });
      return;
    }
    const a = i * 2.39996; // golden angle
    const r = 18 * Math.sqrt(i + 1);
    out.set(id, { id, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, mass: 1 });
  });
  return out;
}

/** One integration step. O(n²) repulsion — fine for the few hundred nodes we render. Returns kinetic energy. */
export function stepSimulation(nodes: Map<string, SimNode>, edges: { source: string; target: string; weight?: number }[], p: SimParams = DEFAULT_SIM): number {
  const arr = [...nodes.values()];
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    for (let j = i + 1; j < arr.length; j++) {
      const b = arr[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) {
        dx = (i - j) * 0.1;
        dy = 0.1;
        d2 = dx * dx + dy * dy;
      }
      const f = p.repulsion / d2;
      const d = Math.sqrt(d2);
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx / a.mass;
      a.vy += fy / a.mass;
      b.vx -= fx / b.mass;
      b.vy -= fy / b.mass;
    }
  }
  for (const e of edges) {
    const a = nodes.get(e.source);
    const b = nodes.get(e.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const f = p.springK * (d - p.springLength) * (e.weight ?? 1);
    const fx = (dx / d) * f;
    const fy = (dy / d) * f;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }
  let energy = 0;
  for (const n of arr) {
    n.vx -= n.x * p.gravity;
    n.vy -= n.y * p.gravity;
    n.vx *= p.damping;
    n.vy *= p.damping;
    // clamp velocity to keep the sim stable
    const v = Math.hypot(n.vx, n.vy);
    if (v > 40) {
      n.vx = (n.vx / v) * 40;
      n.vy = (n.vy / v) * 40;
    }
    if (!n.fixed) {
      n.x += n.vx;
      n.y += n.vy;
    }
    energy += n.vx * n.vx + n.vy * n.vy;
  }
  return energy;
}
