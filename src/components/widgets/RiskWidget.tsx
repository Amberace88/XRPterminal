"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { GLOSSARY } from "@/components/ui/Tooltip";
import { useDailyHistory } from "@/hooks/useMarketData";
import { computeRegime, computeRisk, type RiskLevel } from "@/lib/analytics/regime";

const LEVEL_TONE: Record<RiskLevel, "success" | "info" | "warning" | "danger"> = { LOW: "success", MODERATE: "info", ELEVATED: "warning", HIGH: "danger" };
const LEVEL_VAR: Record<RiskLevel, string> = { LOW: "--success", MODERATE: "--info", ELEVATED: "--warning", HIGH: "--danger" };

/** Semicircle gauge 0–100 with level thresholds (35 / 52 / 70 — see computeRisk). */
export function RiskGauge({ score, level }: { score: number; level: RiskLevel }) {
  const r = 52;
  const cx = 64;
  const cy = 64;
  const pt = (v: number) => {
    const a = Math.PI * (1 - v / 100);
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)] as const;
  };
  const arc = (from: number, to: number) => {
    const [x0, y0] = pt(from);
    const [x1, y1] = pt(to);
    return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
  };
  const v = Math.max(0, Math.min(100, score));
  const [nx, ny] = pt(v);
  return (
    <svg viewBox="0 0 128 74" className="h-[92px] w-[160px]" role="img" aria-label={`Risk score ${v.toFixed(0)} of 100, ${level}`}>
      <path d={arc(0, 100)} style={{ stroke: "rgb(var(--surface-hover))" }} strokeWidth={10} fill="none" strokeLinecap="round" />
      {[35, 52, 70].map((t) => {
        const [x, y] = pt(t);
        return <circle key={t} cx={x} cy={y} r={1.2} style={{ fill: "rgb(var(--text-muted))" }} />;
      })}
      {v > 0.5 && <path d={arc(0, v)} style={{ stroke: `rgb(var(${LEVEL_VAR[level]}))` }} strokeWidth={10} fill="none" strokeLinecap="round" />}
      <circle cx={nx} cy={ny} r={4} style={{ fill: "rgb(var(--text-primary))" }} />
      <text x={cx} y={cy - 6} textAnchor="middle" className="num" style={{ fill: "rgb(var(--text-primary))", fontSize: 20, fontWeight: 600 }}>
        {v.toFixed(0)}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" style={{ fill: "rgb(var(--text-muted))", fontSize: 8 }}>
        / 100
      </text>
    </svg>
  );
}

/** Dashboard widget: measurable risk level, score gauge and weighted components (spec §24). */
export function RiskWidget({ className }: { className?: string }) {
  const h = useDailyHistory("XRP-USD");
  const risk = useMemo(() => {
    if (!h.data) return null;
    const regime = computeRegime(h.data.candles);
    return computeRisk(h.data.candles, regime);
  }, [h.data]);
  const ok = risk && Number.isFinite(risk.score);
  return (
    <Card className={className}>
      <CardHeader
        title="Risk level"
        info={GLOSSARY.risk}
        subtitle="Current measurable conditions"
        actions={
          <Link href="/market#health" className="text-2xs font-medium text-accent hover:underline">
            Open →
          </Link>
        }
      />
      <CardBody>
        {h.error && !risk ? (
          <ErrorState compact message={h.error.message} onRetry={h.reload} lastUpdated={h.updatedAt} />
        ) : !risk ? (
          <SkeletonRows rows={4} />
        ) : !ok ? (
          <EmptyState title="Not enough history" description={risk.explanation} className="py-6" />
        ) : (
          <>
            <div className="flex items-center gap-4">
              <RiskGauge score={risk.score} level={risk.level} />
              <div>
                <Badge tone={LEVEL_TONE[risk.level]} className="px-2 py-1 text-xs">
                  {risk.level}
                </Badge>
                <p className="mt-2 text-2xs leading-relaxed text-fg-muted">Elevated risk describes current conditions — it is not a prediction of a decline.</p>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5" aria-label="Risk components">
              {risk.components.map((c) => (
                <li key={c.name} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-fg-secondary">
                      {c.name} <span className="text-2xs text-fg-muted">×{c.weight}</span>
                    </span>
                    <span className="num text-fg">{c.score.toFixed(0)}</span>
                  </div>
                  <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-surface-hover" title={c.detail}>
                    <div className="h-full rounded-full bg-accent/70" style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardBody>
      <CardFooter>
        <DataFreshness provenance={h.data?.provenance} timestamp={h.data?.provenance.fetchedAt} kind="daily" />
        <span>Weighted, deterministic</span>
      </CardFooter>
    </Card>
  );
}
