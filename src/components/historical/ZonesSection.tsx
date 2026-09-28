"use client";

import { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/States";
import { PriceChart, type PriceLine } from "@/components/charts/PriceChart";
import { tokenColor } from "@/components/charts/theme";
import { utcDate } from "@/components/market/parts";
import { DEFAULT_ZONE_PARAMS, reactionZones } from "@/lib/analytics/zones";
import { formatPct, formatPrice } from "@/lib/format";
import type { CandleSeries } from "@/lib/types/market";
import { cn } from "@/lib/utils/cn";
import { Note, Section } from "./Section";

type Look = "365" | "730" | "1460";

export function ZonesSection({ xrp }: { xrp: CandleSeries }) {
  const [look, setLook] = useState<Look>("730");
  const res = useMemo(() => reactionZones(xrp.candles, { lookbackDays: Number(look) }), [xrp, look]);
  const candles = useMemo(() => xrp.candles.slice(-Number(look)), [xrp, look]);
  const lines = useMemo<PriceLine[]>(
    () =>
      res.zones.flatMap((z, i) => {
        const color = z.side === "above" ? tokenColor("warning", 0.8) : z.side === "below" ? tokenColor("info", 0.8) : tokenColor("text-secondary", 0.8);
        return [
          { price: z.high, label: `Z${i + 1}`, color, dashed: true },
          { price: z.low, label: "", color, dashed: true },
        ];
      }),
    [res],
  );
  return (
    <Section
      id="zones"
      title="Historical reaction zones"
      icon={<Layers className="h-4 w-4" />}
      subtitle={`Price areas where XRP repeatedly reversed or traded heavily · lookback ${look} days`}
      provenance={xrp.provenance}
      actions={
        <Tabs
          ariaLabel="Lookback"
          size="xs"
          value={look}
          onChange={setLook}
          items={[
            { value: "365", label: "1Y" },
            { value: "730", label: "2Y" },
            { value: "1460", label: "4Y" },
          ]}
        />
      }
      methodology={
        <>
          <p>
            Swing pivots are daily highs (lows) that are the highest (lowest) of the surrounding ±{DEFAULT_ZONE_PARAMS.pivotSpan} days, so the last {DEFAULT_ZONE_PARAMS.pivotSpan} days cannot form pivots. Pivot prices are clustered
            in log-space when within {DEFAULT_ZONE_PARAMS.tolerancePct}% of the cluster mean; clusters with at least two pivots become zones.
          </p>
          <p>
            Volume-at-price spreads each day&apos;s quote volume (single provider) evenly over the price bins its high–low range covers; a zone&apos;s volume share is the portion of lookback volume traded inside it. Zones are ranked
            by recency-weighted touches plus volume share; up to {DEFAULT_ZONE_PARAMS.maxZonesPerSide} per side are shown.
          </p>
          <p>These are statistical descriptions of past trading. They are <strong>not</strong> guaranteed support or resistance and may not produce any reaction in the future.</p>
        </>
      }
      footer={<span>“Historical reaction zone” ≠ support/resistance guarantee</span>}
    >
      {res.zones.length === 0 ? (
        <EmptyState title="No reaction zones found" description="Not enough repeated pivots in this lookback. Try a longer window." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="min-w-0 lg:col-span-3">
            <PriceChart candles={candles} height={320} showVolume={false} priceLines={lines} fitKey={look} />
          </div>
          <ul className="space-y-1.5 lg:col-span-2" aria-label="Reaction zones">
            {res.zones.map((z, i) => (
              <li key={`${z.low}-${z.high}`} className="rounded-lg border border-border-subtle px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-fg">
                    Z{i + 1} · {z.side === "above" ? "above price" : z.side === "below" ? "below price" : "price inside zone"}
                  </span>
                  <span className={cn("num text-xs", z.distancePct >= 0 ? "text-fg-secondary" : "text-fg-secondary")}>{formatPct(z.distancePct, 1)}</span>
                </div>
                <div className="num mt-0.5 text-sm text-fg">
                  {formatPrice(z.low, "USD")} – {formatPrice(z.high, "USD")}
                </div>
                <div className="mt-0.5 text-2xs text-fg-muted">
                  {z.touches} reactions ({z.highs} highs, {z.lows} lows) · {z.volumeSharePct.toFixed(1)}% of volume · last {utcDate(z.lastTouchT)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Note>
        {res.pivots} swing pivots analysed since {utcDate(res.lookbackStart)}. Latest close {formatPrice(res.lastClose, "USD")}. Distances are from the latest close to each zone&apos;s midpoint.
      </Note>
    </Section>
  );
}
