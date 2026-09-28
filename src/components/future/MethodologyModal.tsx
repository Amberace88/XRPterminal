"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { GATING_RULE_TEXT } from "@/lib/forecast/horizons";
import { BASELINE_REGISTRY, MODEL_CHANGELOG, MODEL_REGISTRY } from "@/lib/forecast/registry";
import type { ForecastOutput } from "@/lib/forecast/types";

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-fg-secondary">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}

export function MethodologyModal({ open, onClose, f }: { open: boolean; onClose: () => void; f?: ForecastOutput }) {
  const m = MODEL_REGISTRY[0];
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Methodology & model card"
      description={`${m.modelName} v${m.version} · owner: ${m.owner}`}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-fg">Purpose</h3>
          <p className="text-xs leading-relaxed text-fg-secondary">{m.purpose}</p>
          <h3 className="pt-2 text-sm font-semibold text-fg">Method</h3>
          <List
            items={[
              `Stationary block bootstrap of daily log returns (mean block ${f?.parameters.blockLength ?? 10} days) — preserves volatility clustering.`,
              `Training sample: ${m.trainingPeriod}`,
              "Returns are demeaned: the historical drift is not extrapolated, so the model makes no directional call.",
              "Volatility scaling: sampled returns × s(t) = 1 + (k−1)·e^(−t/30), k = current 30D vol ÷ training vol, clamped 0.5–2.0.",
              `${f?.parameters.paths ?? 4000} simulated paths; seeded PRNG (seed = hash(model, version, as-of date, horizon)) ⇒ identical inputs give identical outputs.`,
              "Scenarios are fixed quantile bands of the terminal price: BEAR P5–P25, BASE P25–P75, BULL P75–P95, EXTREME <P5 / >P95 (P1/P99 shown).",
              "Only completed UTC daily candles from a single provider are used; the in-progress day is excluded.",
            ]}
          />
          <h3 className="pt-2 text-sm font-semibold text-fg">Inputs</h3>
          <List items={m.inputs} />
        </section>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-fg">Horizon gating</h3>
          <p className="text-xs leading-relaxed text-fg-secondary">{GATING_RULE_TEXT}</p>
          <h3 className="pt-2 text-sm font-semibold text-fg">Evaluation</h3>
          <p className="text-xs leading-relaxed text-fg-secondary">{m.evaluation}</p>
          <List items={BASELINE_REGISTRY.map((b) => `${b.label}: ${b.description}`)} />
          <h3 className="pt-2 text-sm font-semibold text-fg">Limitations</h3>
          <List items={[...m.limitations, ...(f?.uncertainty.limitations ?? [])]} />
          <h3 className="pt-2 text-sm font-semibold text-fg">Immutability</h3>
          <p className="text-xs leading-relaxed text-fg-secondary">
            Published forecasts are append-only database records: an identity hash (asset, horizon, as-of date, model version) prevents duplicates and a payload hash
            makes any alteration detectable. A new model version creates new records — earlier ones are never overwritten. Matured forecasts are evaluated automatically
            against the realized close.
          </p>
          <h3 className="pt-2 text-sm font-semibold text-fg">Changelog</h3>
          <ul className="space-y-1 text-xs text-fg-secondary">
            {MODEL_CHANGELOG.map((c) => (
              <li key={c.newVersion}>
                <span className="num text-fg">
                  {c.oldVersion ?? "—"} → {c.newVersion}
                </span>{" "}
                ({c.effectiveDate}): {c.reason}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
