"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Switch } from "@/components/ui/Misc";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/components/providers/AuthProvider";
import { canUseSmartAlerts, planOf } from "@/lib/entitlements";
import { newRuleFromInput, planErrors, validateRule, type RuleInput } from "@/lib/alerts/schema";
import { describeCondition } from "@/lib/alerts/engine";
import { newId } from "@/lib/alerts/repo";
import type { AlertCondition, AlertRule } from "@/lib/alerts/types";
import { ConditionEditor, defaultCondition } from "./ConditionEditor";

export interface RuleDraft {
  name?: string;
  conditions: AlertCondition[];
  watchlistItemId?: string | null;
}

export function RuleForm({
  open,
  onClose,
  onSave,
  initial,
  draft,
  existingCount,
  price,
  emailAvailable,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (rule: AlertRule) => Promise<void>;
  initial?: AlertRule | null;
  draft?: RuleDraft | null;
  existingCount: number;
  price?: number | null;
  emailAvailable: boolean;
}) {
  const { plan } = useAuth();
  const [input, setInput] = useState<RuleInput>(() => blank(price));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const smart = canUseSmartAlerts(plan);

  useEffect(() => {
    if (!open) return;
    setErrors([]);
    if (initial) setInput({ name: initial.name, conditions: initial.conditions, priority: initial.priority, cooldownMin: initial.cooldownMin, channels: initial.channels, enabled: initial.enabled, watchlistItemId: initial.watchlistItemId ?? null });
    else if (draft) setInput({ ...blank(price), name: draft.name ?? describeCondition(draft.conditions[0]), conditions: draft.conditions, watchlistItemId: draft.watchlistItemId ?? null });
    else setInput(blank(price));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, draft]);

  const setCond = (i: number, c: AlertCondition) => setInput((s) => ({ ...s, conditions: s.conditions.map((x, j) => (j === i ? c : x)) as RuleInput["conditions"] }));

  const submit = async () => {
    const v = validateRule({ ...input, name: input.name.trim() || describeCondition(input.conditions[0]) });
    if (!v.ok) return setErrors(v.errors);
    const pe = planErrors({ conditions: v.data.conditions as AlertCondition[] }, plan, existingCount, !initial);
    if (pe.length) return setErrors(pe);
    const now = Date.now();
    const rule: AlertRule = initial
      ? { ...initial, name: v.data.name, conditions: v.data.conditions as AlertCondition[], priority: v.data.priority, cooldownMin: v.data.cooldownMin, channels: v.data.channels, enabled: v.data.enabled, updatedAt: now }
      : newRuleFromInput(v.data, newId(), now);
    setBusy(true);
    try {
      await onSave(rule);
      onClose();
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Could not save"]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={initial ? "Edit alert" : "New alert"}
      description={`${planOf(plan).name} plan · ${planOf(plan).limits.alerts} rules · ${smart ? "multi-condition AND alerts enabled" : "single-condition alerts (AND combinations on Pro+)"}`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} loading={busy}>
            {initial ? "Save changes" : "Create alert"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="rule-name">
          <input id="rule-name" className="input" maxLength={80} value={input.name} onChange={(e) => setInput((s) => ({ ...s, name: e.target.value }))} placeholder={describeCondition(input.conditions[0])} />
        </Field>
        <div className="space-y-2">
          {input.conditions.map((c, i) => (
            <ConditionEditor
              key={i}
              index={i}
              value={c}
              price={price}
              onChange={(nc) => setCond(i, nc)}
              onRemove={input.conditions.length > 1 ? () => setInput((s) => ({ ...s, conditions: s.conditions.filter((_, j) => j !== i) as RuleInput["conditions"] })) : undefined}
            />
          ))}
          <Button
            variant="outline"
            size="xs"
            disabled={!smart || input.conditions.length >= 4}
            onClick={() => setInput((s) => ({ ...s, conditions: [...s.conditions, defaultCondition("volatility_above", price)] as RuleInput["conditions"] }))}
            title={smart ? "Add an AND condition" : "Smart (AND) alerts require Pro+"}
          >
            <Plus className="h-3.5 w-3.5" /> AND condition {!smart && <Badge tone="accent">Pro+</Badge>}
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Priority" htmlFor="rule-priority" hint="Critical bypasses aggregation and the daily limit.">
            <select id="rule-priority" className="select" value={input.priority} onChange={(e) => setInput((s) => ({ ...s, priority: e.target.value as RuleInput["priority"] }))}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="critical">Critical</option>
            </select>
          </Field>
          <Field label="Cooldown (minutes)" htmlFor="rule-cooldown" hint="Minimum time between notifications for this rule.">
            <input id="rule-cooldown" type="number" min={1} max={10080} className="input num" value={input.cooldownMin} onChange={(e) => setInput((s) => ({ ...s, cooldownMin: Math.round(Number(e.target.value)) }))} />
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium text-fg-secondary">Channels</legend>
          {(
            [
              ["inApp", "In-app notification center", true],
              ["push", "Browser push (when the tab is in the background)", true],
              ["email", emailAvailable ? "Email" : "Email — not configured", emailAvailable],
            ] as const
          ).map(([k, label, avail]) => (
            <label key={k} className={`flex items-center justify-between gap-3 text-xs ${avail ? "text-fg-secondary" : "text-fg-muted"}`}>
              {label}
              <Switch checked={input.channels[k] && avail} disabled={!avail} onChange={(v) => setInput((s) => ({ ...s, channels: { ...s.channels, [k]: v } }))} label={label} />
            </label>
          ))}
          <p className="text-2xs text-fg-muted">Telegram & Discord: planned.</p>
        </fieldset>
        <label className="flex items-center justify-between gap-3 text-xs text-fg-secondary">
          Enabled
          <Switch checked={input.enabled} onChange={(v) => setInput((s) => ({ ...s, enabled: v }))} label="Enabled" />
        </label>
        {errors.length > 0 && (
          <ul className="space-y-0.5 rounded-md border border-danger/25 bg-danger/5 p-2 text-2xs text-danger" role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function blank(price?: number | null): RuleInput {
  return {
    name: "",
    conditions: [defaultCondition("price_above", price)] as RuleInput["conditions"],
    priority: "normal",
    cooldownMin: 60,
    channels: { inApp: true, push: true, email: false },
    enabled: true,
    watchlistItemId: null,
  };
}
