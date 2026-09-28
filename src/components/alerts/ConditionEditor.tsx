"use client";

import { Trash2 } from "lucide-react";
import { Field } from "@/components/ui/Misc";
import { NEWS_CATEGORIES } from "@/lib/news/types";
import { CATEGORY_LABEL } from "@/components/news/categories";
import type { AlertCondition, ConditionType } from "@/lib/alerts/types";

export const CONDITION_OPTIONS: { value: ConditionType; label: string; group: string }[] = [
  { value: "price_above", label: "Price above", group: "Market" },
  { value: "price_below", label: "Price below", group: "Market" },
  { value: "change_24h", label: "24h % change", group: "Market" },
  { value: "volume_above", label: "24h volume above", group: "Market" },
  { value: "volatility_above", label: "Volatility above (Pro)", group: "Market" },
  { value: "regime_change", label: "Regime change (Pro)", group: "Market" },
  { value: "wallet_activity", label: "Wallet sends/receives", group: "XRPL" },
  { value: "whale_tx", label: "Whale transaction", group: "XRPL" },
  { value: "news", label: "News keyword / category", group: "News" },
  { value: "forecast_change", label: "Forecast range change (Pro)", group: "Forecast" },
  { value: "portfolio_value", label: "Portfolio value threshold", group: "Portfolio" },
];

const REGIMES = ["ANY", "TRENDING UP", "TRENDING DOWN", "RANGE", "HIGH VOLATILITY", "LOW VOLATILITY", "TRANSITION"] as const;

export function defaultCondition(type: ConditionType, price?: number | null): AlertCondition {
  const p = price && price > 0 ? Number(price.toPrecision(4)) : 1;
  switch (type) {
    case "price_above":
      return { type, value: Number((p * 1.05).toPrecision(4)) };
    case "price_below":
      return { type, value: Number((p * 0.95).toPrecision(4)) };
    case "change_24h":
      return { type, value: 5, direction: "either" };
    case "volatility_above":
      return { type, value: 100 };
    case "volume_above":
      return { type, value: 100_000_000 };
    case "regime_change":
      return { type, to: "ANY" };
    case "wallet_activity":
      return { type, address: "", direction: "any", minXrp: 10_000 };
    case "whale_tx":
      return { type, minXrp: 10_000_000 };
    case "news":
      return { type, keywords: [], categories: ["REGULATION"] };
    case "forecast_change":
      return { type, minShiftPct: 10 };
    case "portfolio_value":
      return { type, op: "below", value: 1000 };
  }
}

const num = (v: string) => (v === "" ? NaN : Number(v));

export function ConditionEditor({ value, onChange, onRemove, index, price }: { value: AlertCondition; onChange: (c: AlertCondition) => void; onRemove?: () => void; index: number; price?: number | null }) {
  const id = (s: string) => `cond-${index}-${s}`;
  return (
    <div className="space-y-3 rounded-lg border border-border-subtle bg-bg-secondary/40 p-3">
      <div className="flex items-end gap-2">
        <Field label={index === 0 ? "Condition" : "AND"} htmlFor={id("type")} className="flex-1">
          <select id={id("type")} className="select" value={value.type} onChange={(e) => onChange(defaultCondition(e.target.value as ConditionType, price))}>
            {CONDITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.group} · {o.label}
              </option>
            ))}
          </select>
        </Field>
        {onRemove && (
          <button type="button" onClick={onRemove} className="mb-1 rounded-md p-2 text-fg-muted hover:bg-surface-hover hover:text-danger" aria-label="Remove condition">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {(value.type === "price_above" || value.type === "price_below") && (
        <Field label="Price (USD)" htmlFor={id("v")} hint={price ? `Current ≈ $${price}` : undefined}>
          <input id={id("v")} type="number" step="any" min={0} className="input num" value={Number.isFinite(value.value) ? value.value : ""} onChange={(e) => onChange({ ...value, value: num(e.target.value) })} />
        </Field>
      )}
      {value.type === "change_24h" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Move ≥ (%)" htmlFor={id("v")}>
            <input id={id("v")} type="number" step="any" min={0} className="input num" value={Number.isFinite(value.value) ? value.value : ""} onChange={(e) => onChange({ ...value, value: num(e.target.value) })} />
          </Field>
          <Field label="Direction" htmlFor={id("d")}>
            <select id={id("d")} className="select" value={value.direction} onChange={(e) => onChange({ ...value, direction: e.target.value as "up" | "down" | "either" })}>
              <option value="either">Either</option>
              <option value="up">Up</option>
              <option value="down">Down</option>
            </select>
          </Field>
        </div>
      )}
      {value.type === "volatility_above" && (
        <Field label="30D realized volatility ≥ (% annualized)" htmlFor={id("v")} hint="Computed from daily closes (same method as the regime engine).">
          <input id={id("v")} type="number" step="any" min={0} className="input num" value={Number.isFinite(value.value) ? value.value : ""} onChange={(e) => onChange({ ...value, value: num(e.target.value) })} />
        </Field>
      )}
      {value.type === "volume_above" && (
        <Field label="24h volume ≥ (USD, primary venue)" htmlFor={id("v")} hint="Single-venue volume from the live ticker source.">
          <input id={id("v")} type="number" step="any" min={0} className="input num" value={Number.isFinite(value.value) ? value.value : ""} onChange={(e) => onChange({ ...value, value: num(e.target.value) })} />
        </Field>
      )}
      {value.type === "regime_change" && (
        <Field label="Notify when regime changes to" htmlFor={id("r")}>
          <select id={id("r")} className="select" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value as (typeof REGIMES)[number] })}>
            {REGIMES.map((r) => (
              <option key={r} value={r}>
                {r === "ANY" ? "Any regime" : r}
              </option>
            ))}
          </select>
        </Field>
      )}
      {value.type === "wallet_activity" && (
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="XRPL address" htmlFor={id("a")} className="sm:col-span-3">
            <input id={id("a")} className="input font-mono" spellCheck={false} value={value.address} onChange={(e) => onChange({ ...value, address: e.target.value.trim() })} placeholder="r…" />
          </Field>
          <Field label="Direction" htmlFor={id("d")}>
            <select id={id("d")} className="select" value={value.direction} onChange={(e) => onChange({ ...value, direction: e.target.value as "sent" | "received" | "any" })}>
              <option value="any">Sends or receives</option>
              <option value="sent">Sends</option>
              <option value="received">Receives</option>
            </select>
          </Field>
          <Field label="Minimum XRP" htmlFor={id("m")} className="sm:col-span-2">
            <input id={id("m")} type="number" min={0} className="input num" value={Number.isFinite(value.minXrp) ? value.minXrp : ""} onChange={(e) => onChange({ ...value, minXrp: num(e.target.value) })} />
          </Field>
        </div>
      )}
      {value.type === "whale_tx" && (
        <Field label="Any XRP payment ≥ (XRP)" htmlFor={id("m")} hint="Watches the live validated transaction stream while the app is open.">
          <input id={id("m")} type="number" min={100000} className="input num" value={Number.isFinite(value.minXrp) ? value.minXrp : ""} onChange={(e) => onChange({ ...value, minXrp: num(e.target.value) })} />
        </Field>
      )}
      {value.type === "news" && (
        <div className="space-y-2">
          <Field label="Keywords (comma-separated)" htmlFor={id("k")} hint="Matched in headlines, case-insensitive.">
            <input
              id={id("k")}
              className="input"
              defaultValue={value.keywords.join(", ")}
              onBlur={(e) =>
                onChange({
                  ...value,
                  keywords: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter((s) => s.length >= 2)
                    .slice(0, 10),
                })
              }
              placeholder="RLUSD, ETF, amendment"
            />
          </Field>
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-fg-secondary">Categories</legend>
            <div className="flex flex-wrap gap-1">
              {NEWS_CATEGORIES.map((c) => {
                const on = value.categories.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange({ ...value, categories: on ? value.categories.filter((x) => x !== c) : [...value.categories, c] })}
                    className={`rounded-md border px-2 py-0.5 text-2xs ${on ? "border-accent/50 bg-accent/10 text-fg" : "border-border-subtle text-fg-muted hover:text-fg"}`}
                  >
                    {CATEGORY_LABEL[c]}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      )}
      {value.type === "forecast_change" && (
        <Field label="Range midpoint or width shifts ≥ (%)" htmlFor={id("v")} hint="Uses the published forecast from Future Intelligence when available.">
          <input id={id("v")} type="number" min={0} step="any" className="input num" value={Number.isFinite(value.minShiftPct) ? value.minShiftPct : ""} onChange={(e) => onChange({ ...value, minShiftPct: num(e.target.value) })} />
        </Field>
      )}
      {value.type === "portfolio_value" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="When portfolio is" htmlFor={id("o")}>
            <select id={id("o")} className="select" value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value as "above" | "below" })}>
              <option value="below">Below</option>
              <option value="above">Above</option>
            </select>
          </Field>
          <Field label="Value (USD)" htmlFor={id("v")}>
            <input id={id("v")} type="number" min={0} step="any" className="input num" value={Number.isFinite(value.value) ? value.value : ""} onChange={(e) => onChange({ ...value, value: num(e.target.value) })} />
          </Field>
          <p className="col-span-2 text-2xs text-fg-muted">Evaluated when the Portfolio module publishes a value in this session; otherwise it stays idle.</p>
        </div>
      )}
    </div>
  );
}
