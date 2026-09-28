"use client";

import { useId, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** Accessible hover/focus tooltip. */
export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined} className="inline-flex">
        {children}
      </span>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            "pointer-events-none absolute left-1/2 z-50 w-max max-w-[280px] -translate-x-1/2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs font-normal normal-case leading-relaxed tracking-normal text-fg-secondary shadow-card",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}

/** Small (i) icon with explanatory tooltip — used for technical concepts (spec §251). */
export function InfoTip({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip content={text}>
      <button type="button" aria-label="More information" className={cn("text-fg-muted hover:text-fg-secondary", className)}>
        <Info className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}

/** Glossary for consistent tooltips across the app. */
export const GLOSSARY = {
  regime:
    "Market regime classifies current conditions (trend, volatility) from measurable inputs. It describes the present — it does not predict direction.",
  drawdown: "Drawdown is the percentage decline from the most recent peak to the current or subsequent low.",
  volatility: "Realized volatility: annualized standard deviation of daily log returns over the window.",
  correlation: "Pearson correlation of daily log returns. Ranges −1 to +1. Correlation does not imply causation.",
  profitFactor: "Profit factor = gross profits ÷ gross losses. Above 1 means winners outweighed losers in the sample.",
  slippage: "Slippage: difference between the expected price and the simulated fill price.",
  coverage: "Forecast coverage: share of past forecasts whose realized price fell inside the stated range.",
  risk: "Risk level combines measurable conditions (volatility, drawdown, regime, abnormal volume). Elevated risk ≠ a prediction of a crash.",
  rMultiple: "R-multiple = realized result ÷ initial risk (entry-to-stop distance × size).",
  atr: "Average True Range: average of the true range (max of high−low, |high−prev close|, |low−prev close|) over N periods.",
} as const;
