"use client";

import { useEffect, useRef, useState } from "react";
import { Blocks, CandlestickChart } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import type { Ticker } from "@/lib/types/market";
import { formatAge, formatNumber, formatPrice } from "@/lib/format";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { Delta } from "@/components/ui/MetricCard";
import { Skeleton } from "@/components/ui/States";
import { cn } from "@/lib/utils/cn";
import { useLiveLedger } from "./useLiveLedger";

/** Brief highlight when a live value changes (direction-coloured). Disabled by reduced-motion CSS. */
function useFlash(value: number | null | undefined) {
  const prev = useRef<number | null | undefined>(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (value == null || prev.current == null || value === prev.current) {
      prev.current = value;
      return;
    }
    setFlash(value > prev.current ? "up" : "down");
    prev.current = value;
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [value]);
  return flash;
}

export function useLiveTicker() {
  return useApi<{ ticker: Ticker; attempted: string[] }>("/api/market/ticker?pair=XRP-USD", { refreshMs: 15_000, staleMs: 10_000 });
}

/** Live XRP/USD price and latest validated XRPL ledger. Never shows a number it didn't receive. */
export function LivePulse({ className }: { className?: string }) {
  const { data, error, loading, updatedAt } = useLiveTicker();
  const ledger = useLiveLedger();
  const latest = ledger.ledgers[0];
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const t = data?.ticker;
  const flash = useFlash(t?.price);

  return (
    <div
      className={cn(
        "grid w-full max-w-xl grid-cols-1 divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-surface/70 backdrop-blur-md sm:grid-cols-2 sm:divide-x sm:divide-y-0",
        className,
      )}
      aria-live="polite"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border-subtle bg-bg-secondary text-accent">
          <CandlestickChart className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="label">XRP / USD</span>
            {t && <DataFreshness provenance={t.provenance} timestamp={updatedAt ?? t.provenance.fetchedAt} />}
          </div>
          {loading && !t ? (
            <Skeleton className="mt-1 h-6 w-32" />
          ) : error && !t ? (
            <p className="mt-0.5 text-sm text-fg-muted">Price unavailable</p>
          ) : t ? (
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  "num text-lg font-semibold tracking-tight text-fg transition-colors duration-700",
                  flash === "up" && "text-success",
                  flash === "down" && "text-danger",
                )}
              >
                {formatPrice(t.price, "USD")}
              </span>
              <Delta value={t.changePct24h} className="text-xs" />
              <span className="hidden truncate text-2xs text-fg-muted md:inline">{t.provenance.source}</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border-subtle bg-bg-secondary text-accent">
          <Blocks className="h-4 w-4" />
          {ledger.conn === "connected" && latest && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse2 rounded-full bg-success" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="label">XRPL ledger</span>
            {latest ? (
              <span className="text-2xs font-medium text-success">Live</span>
            ) : ledger.conn === "failed" ? (
              <span className="text-2xs text-fg-muted">Unavailable</span>
            ) : null}
          </div>
          {latest ? (
            <div className="flex items-baseline gap-2">
              <span className="num text-lg font-semibold tracking-tight text-fg">#{formatNumber(latest.index, 0)}</span>
              <span className="text-2xs text-fg-muted">
                closed {formatAge(latest.closeTime, now)}
                {latest.txnCount != null && <> · {latest.txnCount} txs</>}
              </span>
            </div>
          ) : ledger.conn === "failed" ? (
            <p className="text-sm text-fg-muted">Ledger stream unavailable</p>
          ) : (
            <Skeleton className="mt-1 h-6 w-36" />
          )}
        </div>
      </div>
    </div>
  );
}
