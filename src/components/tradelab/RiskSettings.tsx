"use client";

import { useEffect, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Misc";
import { Modal } from "@/components/ui/Modal";
import { GLOSSARY } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { describeAssumptions } from "@/lib/tradelab/engine";
import { STARTING_CAPITAL_OPTIONS, type AccountSettings, type AccountState } from "@/lib/tradelab/types";
import { KV, NumInput, usd } from "./common";

const n = (v: string, def: number) => (v.trim() === "" || !Number.isFinite(Number(v)) ? def : Number(v));

/** Risk & simulation controls (spec §104) + account reset with explicit confirmation (spec §215). */
export function RiskSettingsCard({ state, onSave, onReset }: { state: AccountState; onSave: (s: AccountSettings) => void; onReset: (capital: number) => void }) {
  const [open, setOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const s = state.settings;
  return (
    <Card>
      <CardHeader
        title="Risk & simulation settings"
        icon={<SlidersHorizontal className="h-4 w-4" />}
        info="Simulation controls. Orders that break them are REJECTED with a reason."
        actions={
          <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
            Edit
          </Button>
        }
      />
      <CardBody className="pt-2">
        <KV label="Max risk / trade" value={s.risk.maxRiskPct ? `${s.risk.maxRiskPct}%` : "Off"} />
        <KV label="Max position" value={s.risk.maxPositionPct && s.risk.maxPositionPct < 100 ? `${s.risk.maxPositionPct}% of equity` : "100% (off)"} />
        <KV label="Max daily loss" value={s.risk.maxDailyLossPct ? `${s.risk.maxDailyLossPct}%` : "Off"} />
        <KV label="Slippage model" value={`${s.slippage.fixedBps} bps${s.slippage.sizeBpsPer100k ? ` +${s.slippage.sizeBpsPer100k}/100k` : ""}${s.slippage.volatilityFactor ? ` +vol×${s.slippage.volatilityFactor}` : ""}`} tip={GLOSSARY.slippage} />
        <KV label="Fees taker / maker" value={`${s.fees.takerPct}% / ${s.fees.makerPct}%`} />
        <KV label="Partial fills" value={s.risk.maxFillQtyPerTick ? `≤ ${s.risk.maxFillQtyPerTick} XRP / update` : "Off"} />
        <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
          <span className="text-2xs text-fg-muted">Account version {state.version}</span>
          <Button size="xs" variant="ghost" onClick={() => setResetOpen(true)}>
            <RotateCcw className="h-3 w-3" /> Reset account
          </Button>
        </div>
      </CardBody>
      <SettingsModal open={open} onClose={() => setOpen(false)} settings={s} onSave={onSave} />
      <ResetModal open={resetOpen} onClose={() => setResetOpen(false)} state={state} onReset={onReset} />
    </Card>
  );
}

function SettingsModal({ open, onClose, settings, onSave }: { open: boolean; onClose: () => void; settings: AccountSettings; onSave: (s: AccountSettings) => void }) {
  const toast = useToast();
  const [f, setF] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setF({
      maxRiskPct: String(settings.risk.maxRiskPct),
      maxPositionPct: String(settings.risk.maxPositionPct),
      maxDailyLossPct: String(settings.risk.maxDailyLossPct),
      fixedBps: String(settings.slippage.fixedBps),
      sizeBps: String(settings.slippage.sizeBpsPer100k),
      volFactor: String(settings.slippage.volatilityFactor),
      maxBps: String(settings.slippage.maxBps),
      taker: String(settings.fees.takerPct),
      maker: String(settings.fees.makerPct),
      fillCap: settings.risk.maxFillQtyPerTick ? String(settings.risk.maxFillQtyPerTick) : "",
      quoteAge: String(Math.round(settings.risk.maxQuoteAgeMs / 1000)),
    });
  }, [open, settings]);
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const save = () => {
    const next: AccountSettings = {
      slippage: {
        fixedBps: clamp(n(f.fixedBps, 5), 0, 500),
        sizeBpsPer100k: clamp(n(f.sizeBps, 0), 0, 500),
        volatilityFactor: clamp(n(f.volFactor, 0), 0, 5),
        maxBps: clamp(n(f.maxBps, 200), 1, 2000),
      },
      fees: { takerPct: clamp(n(f.taker, 0.1), 0, 5), makerPct: clamp(n(f.maker, 0.05), 0, 5), label: settings.fees.label },
      risk: {
        maxRiskPct: clamp(n(f.maxRiskPct, 0), 0, 100),
        maxPositionPct: clamp(n(f.maxPositionPct, 100), 1, 100),
        maxDailyLossPct: clamp(n(f.maxDailyLossPct, 0), 0, 100),
        maxQuoteAgeMs: clamp(n(f.quoteAge, 120), 5, 3600) * 1000,
        maxFillQtyPerTick: f.fillCap?.trim() ? clamp(n(f.fillCap, 0), 1, 1e12) : null,
      },
    };
    onSave(next);
    toast({ tone: "success", title: "Simulation settings saved", description: "Recorded in the paper ledger (SETTINGS_UPDATED)." });
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Risk & simulation settings"
      description="These are simulation controls for your paper account. Changes are recorded in the ledger."
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save}>
            Save settings
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="space-y-3">
          <legend className="label mb-2">Risk limits</legend>
          <Field label="Max risk per trade (% of equity)" hint="Entry-to-stop risk. 0 disables. Checked only when a stop is attached." htmlFor="rs-risk">
            <NumInput id="rs-risk" value={f.maxRiskPct ?? ""} onChange={set("maxRiskPct")} suffix="%" />
          </Field>
          <Field label="Max position (% of equity)" hint="100 = no limit." htmlFor="rs-pos">
            <NumInput id="rs-pos" value={f.maxPositionPct ?? ""} onChange={set("maxPositionPct")} suffix="%" />
          </Field>
          <Field label="Max daily loss (% of day-start equity)" hint="Blocks new entries and cancels open buys for the rest of the UTC day. 0 disables." htmlFor="rs-day">
            <NumInput id="rs-day" value={f.maxDailyLossPct ?? ""} onChange={set("maxDailyLossPct")} suffix="%" />
          </Field>
          <Field label="Max quote age for market orders" hint="Market orders are rejected on older data." htmlFor="rs-age">
            <NumInput id="rs-age" value={f.quoteAge ?? ""} onChange={set("quoteAge")} suffix="sec" />
          </Field>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="label mb-2">Execution model</legend>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Fixed slippage" htmlFor="rs-fbps">
              <NumInput id="rs-fbps" value={f.fixedBps ?? ""} onChange={set("fixedBps")} suffix="bps" />
            </Field>
            <Field label="Slippage cap" htmlFor="rs-cap">
              <NumInput id="rs-cap" value={f.maxBps ?? ""} onChange={set("maxBps")} suffix="bps" />
            </Field>
            <Field label="Size impact / $100k" htmlFor="rs-size">
              <NumInput id="rs-size" value={f.sizeBps ?? ""} onChange={set("sizeBps")} suffix="bps" />
            </Field>
            <Field label="Volatility factor" hint="× recent volatility (bps)" htmlFor="rs-vol">
              <NumInput id="rs-vol" value={f.volFactor ?? ""} onChange={set("volFactor")} suffix="×" />
            </Field>
            <Field label="Taker fee" htmlFor="rs-taker">
              <NumInput id="rs-taker" value={f.taker ?? ""} onChange={set("taker")} suffix="%" />
            </Field>
            <Field label="Maker fee" htmlFor="rs-maker">
              <NumInput id="rs-maker" value={f.maker ?? ""} onChange={set("maker")} suffix="%" />
            </Field>
          </div>
          <Field label="Partial fills: max XRP per order per update" hint="Empty = fill fully. Deterministic liquidity cap." htmlFor="rs-fill">
            <NumInput id="rs-fill" value={f.fillCap ?? ""} onChange={set("fillCap")} suffix="XRP" placeholder="off" />
          </Field>
        </fieldset>
      </div>
    </Modal>
  );
}

function ResetModal({ open, onClose, state, onReset }: { open: boolean; onClose: () => void; state: AccountState; onReset: (capital: number) => void }) {
  const [capital, setCapital] = useState(Number(state.startingCapital) || 100_000);
  const [confirm, setConfirm] = useState("");
  useEffect(() => {
    if (open) setConfirm("");
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reset paper account"
      description="Creates a new account version with fresh virtual capital. Open orders are cancelled and the current position is abandoned. The previous ledger is kept for audit and stays viewable in Performance."
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={confirm !== "RESET"}
            onClick={() => {
              onReset(capital);
              onClose();
            }}
          >
            Reset to {usd(capital, 0)}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="New virtual capital" htmlFor="rs-cap-new">
          <select id="rs-cap-new" className="select" value={capital} onChange={(e) => setCapital(Number(e.target.value))}>
            {STARTING_CAPITAL_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {usd(c, 0)}
              </option>
            ))}
          </select>
        </Field>
        <Field label='Type "RESET" to confirm' htmlFor="rs-confirm">
          <input id="rs-confirm" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </Field>
      </div>
    </Modal>
  );
}

export function AssumptionsCard({ settings }: { settings: AccountSettings }) {
  return (
    <Card>
      <CardHeader title="Simulation assumptions" info="Disclosed per spec: fills are modelled, not real." />
      <CardBody className="pt-2">
        <ul className="list-disc space-y-1.5 pl-4 text-2xs leading-relaxed text-fg-muted">
          {describeAssumptions(settings).map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
