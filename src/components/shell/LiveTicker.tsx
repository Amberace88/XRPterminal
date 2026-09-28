"use client";

import { useEffect, useRef, useState } from "react";
import { useMarket } from "@/components/providers/MarketProvider";
import { formatPct, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { Skeleton } from "@/components/ui/States";

/** Top-bar live XRP price with tick flash and honest freshness state. */
export function LiveTicker({ className }: { className?: string }) {
  const { ticker, status, streaming, toDisplay, currency } = useMarket();
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (!ticker) return;
    if (prev.current !== null && ticker.price !== prev.current) {
      setFlash(ticker.price > prev.current ? "up" : "down");
      const id = setTimeout(() => setFlash(null), 600);
      prev.current = ticker.price;
      return () => clearTimeout(id);
    }
    prev.current = ticker.price;
  }, [ticker]);

  if (!ticker)
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="text-xs font-semibold text-fg-secondary">XRP</span>
        <Skeleton className="h-5 w-20" />
      </div>
    );
  const pct = ticker.changePct24h;
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="text-xs font-semibold text-fg-secondary">XRP</span>
      <span
        className={cn(
          "num rounded px-1 text-sm font-semibold transition-colors duration-500",
          flash === "up" && "bg-success/15 text-success",
          flash === "down" && "bg-danger/15 text-danger",
          !flash && "text-fg",
        )}
      >
        {formatPrice(toDisplay(ticker.price), currency)}
      </span>
      <span className={cn("num text-xs font-medium", (pct ?? 0) >= 0 ? "text-success" : "text-danger")}>{formatPct(pct)}</span>
      <DataFreshness status={status} provenance={ticker.provenance} streaming={streaming} className="hidden md:inline-flex" />
    </div>
  );
}
