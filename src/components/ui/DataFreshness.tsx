"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { DataStatus, Provenance } from "@/lib/types/market";
import { formatAge, formatDateTime } from "@/lib/format";
import { Tooltip } from "./Tooltip";
import { freshnessStatus, type FreshnessKind } from "@/lib/freshness";

const STYLES: Record<DataStatus, { dot: string; text: string; label: string }> = {
  LIVE: { dot: "bg-success animate-pulse2", text: "text-success", label: "Live" },
  RECENT: { dot: "bg-info", text: "text-info", label: "Recent" },
  STALE: { dot: "bg-warning", text: "text-warning", label: "Stale" },
  UNAVAILABLE: { dot: "bg-fg-muted", text: "text-fg-muted", label: "Unavailable" },
};

/** Freshness pill: LIVE / RECENT / STALE / UNAVAILABLE + age, with provenance tooltip (spec §22). */
export function DataFreshness({
  status,
  provenance,
  timestamp,
  kind = "realtime",
  streaming = false,
  className,
  showSource = false,
}: {
  status?: DataStatus;
  provenance?: Provenance | null;
  timestamp?: number | null;
  kind?: FreshnessKind;
  streaming?: boolean;
  className?: string;
  showSource?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const ts = timestamp ?? provenance?.fetchedAt ?? null;
  const s = status ?? freshnessStatus(ts, kind, now, streaming);
  const st = STYLES[s];
  const tip = provenance ? (
    <span className="block space-y-0.5">
      <span className="block text-fg">{provenance.source}</span>
      <span className="block">Data time: {formatDateTime(provenance.timestamp)}</span>
      <span className="block">Fetched: {formatDateTime(provenance.fetchedAt)}</span>
      {provenance.methodology && <span className="block pt-1">{provenance.methodology}</span>}
    </span>
  ) : (
    <span>{ts ? `Updated ${formatDateTime(ts)}` : "No data received yet"}</span>
  );
  return (
    <Tooltip content={tip}>
      <span className={cn("inline-flex items-center gap-1.5 text-2xs font-medium", st.text, className)} tabIndex={0}>
        <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
        {st.label}
        {ts && s !== "LIVE" && <span className="text-fg-muted">· {formatAge(ts, now)}</span>}
        {showSource && provenance && <span className="hidden text-fg-muted sm:inline">· {provenance.source}</span>}
      </span>
    </Tooltip>
  );
}

/** Compact source line for card footers (spec §223). */
export function SourceLine({ provenance, extra }: { provenance?: Provenance | null; extra?: React.ReactNode }) {
  if (!provenance) return null;
  return (
    <span className="truncate text-2xs text-fg-muted">
      Source: {provenance.source} · {formatDateTime(provenance.timestamp)}
      {extra}
    </span>
  );
}
