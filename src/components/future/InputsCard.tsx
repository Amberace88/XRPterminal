"use client";

import { Gauge } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Stat } from "@/components/ui/Misc";
import { InfoTip, GLOSSARY } from "@/components/ui/Tooltip";
import { formatPct } from "@/lib/format";
import type { ForecastOutput } from "@/lib/forecast/types";
import { numOrDash } from "./shared";

const vol = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(0)}%`);

export function InputsCard({ f, className }: { f: ForecastOutput; className?: string }) {
  const i = f.inputs;
  const a = i.analogue;
  return (
    <Card className={className}>
      <CardHeader
        title="Why this range? — measured inputs"
        icon={<Gauge className="h-4 w-4" />}
        subtitle={`All inputs use data up to ${f.asOfDate} only`}
        info="Drivers are measured, not predicted. Only volatility enters the simulation directly; regime, trend, BTC correlation and analogues are shown to explain context."
      />
      <CardBody>
        <div className="divide-y divide-border-subtle">
          <Stat
            label={
              <span className="inline-flex items-center gap-1">
                Market regime <InfoTip text={GLOSSARY.regime} />
              </span>
            }
            value={<Badge tone="info">{i.regime}</Badge>}
          />
          <Stat
            label={
              <span className="inline-flex items-center gap-1">
                30D realized volatility <InfoTip text={GLOSSARY.volatility} />
              </span>
            }
            value={`${vol(i.vol30Ann)} · P${numOrDash(i.volPercentile, 0)}`}
          />
          <Stat label="Training-window volatility" value={vol(i.volTrainAnn)} />
          <Stat
            label={
              <span className="inline-flex items-center gap-1">
                Volatility scale applied <InfoTip text="Current 30D vol ÷ training vol, clamped to 0.5–2.0×, decaying toward 1× with a ~30-day time constant." />
              </span>
            }
            value={`${i.volScaleApplied.toFixed(2)}×${i.volRatioRaw !== null && Math.abs(i.volRatioRaw - i.volScaleApplied) > 1e-9 ? ` (raw ${i.volRatioRaw.toFixed(2)}×, clamped)` : ""}`}
          />
          <Stat label="Price vs 200D average" value={formatPct(i.distFrom200Pct, 1)} />
          <Stat label="30D / 90D return" value={`${formatPct(i.ret30Pct, 1)} / ${formatPct(i.ret90Pct, 1)}`} />
          <Stat
            label={
              <span className="inline-flex items-center gap-1">
                90D correlation with BTC <InfoTip text={GLOSSARY.correlation} />
              </span>
            }
            value={i.btcCorr90 === null ? <span className="text-fg-muted">n/a</span> : i.btcCorr90.toFixed(2)}
          />
        </div>
        {i.btcCorr90 === null && <p className="mt-1 text-2xs text-fg-muted">{i.btcCorrNote}</p>}
        <div className="mt-3 rounded-lg border border-border-subtle bg-bg-secondary/60 p-3">
          <div className="label mb-1 flex items-center gap-1">
            Historical analogue <InfoTip text="Outcomes after past dates in similar measurable conditions. Only outcomes that were already known at the as-of date are used." />
          </div>
          {a && a.medianReturnPct !== null ? (
            <>
              <p className="text-xs text-fg-secondary">
                Median {f.horizonDays}-day return <span className="num font-medium text-fg">{formatPct(a.medianReturnPct, 1)}</span>, middle 50%{" "}
                <span className="num">
                  {formatPct(a.p25ReturnPct, 1)} to {formatPct(a.p75ReturnPct, 1)}
                </span>
                , {numOrDash(a.shareUpPct, 0)}% of cases up.
              </p>
              <p className="mt-1 text-2xs text-fg-muted">
                N = {a.n} dates (~{a.independentN} independent){a.independentN < 10 && <span className="text-warning"> · small sample</span>}. {a.criteria}
              </p>
            </>
          ) : (
            <p className="text-xs text-fg-muted">{a ? `Too few analogue dates (${a.n}) to summarise. ${a.criteria}` : "Not enough history to form analogues."}</p>
          )}
        </div>
        <p className="mt-3 text-2xs leading-relaxed text-fg-muted">{i.regimeExplanation}</p>
      </CardBody>
    </Card>
  );
}
