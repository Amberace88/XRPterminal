import { z } from "zod";
import { NEWS_CATEGORIES } from "@/lib/news/types";
import { canCreateAlert, canUseAdvancedAlerts, canUseSmartAlerts, planOf } from "@/lib/entitlements";
import type { AlertCondition, AlertRule, ConditionType } from "./types";

/** Validation for alert rules (client form + server routes). */

const REGIMES = ["TRENDING UP", "TRENDING DOWN", "RANGE", "HIGH VOLATILITY", "LOW VOLATILITY", "TRANSITION"] as const;
const XRPL_ADDR = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

const pos = (max: number) => z.number().finite().positive().max(max);

export const ConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("price_above"), value: pos(1e6) }),
  z.object({ type: z.literal("price_below"), value: pos(1e6) }),
  z.object({ type: z.literal("change_24h"), value: pos(1000), direction: z.enum(["up", "down", "either"]) }),
  z.object({ type: z.literal("volatility_above"), value: pos(1000) }),
  z.object({ type: z.literal("volume_above"), value: pos(1e13) }),
  z.object({ type: z.literal("regime_change"), to: z.enum([...REGIMES, "ANY"]) }),
  z.object({ type: z.literal("wallet_activity"), address: z.string().regex(XRPL_ADDR, "Invalid XRPL classic address"), direction: z.enum(["sent", "received", "any"]), minXrp: z.number().finite().min(0).max(1e11) }),
  z.object({ type: z.literal("whale_tx"), minXrp: z.number().finite().min(100_000, "Minimum whale threshold is 100,000 XRP").max(1e11) }),
  z.object({
    type: z.literal("news"),
    keywords: z.array(z.string().trim().min(2).max(40)).max(10),
    categories: z.array(z.enum(NEWS_CATEGORIES)).max(13),
  }),
  z.object({ type: z.literal("forecast_change"), minShiftPct: pos(500) }),
  z.object({ type: z.literal("portfolio_value"), op: z.enum(["above", "below"]), value: pos(1e12) }),
]);

export const RuleInputSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(80),
  conditions: z.array(ConditionSchema).min(1, "Add at least one condition").max(4, "Up to 4 conditions"),
  priority: z.enum(["low", "normal", "critical"]),
  cooldownMin: z.number().int().min(1).max(10_080),
  channels: z.object({ inApp: z.boolean(), push: z.boolean(), email: z.boolean() }),
  enabled: z.boolean(),
  watchlistItemId: z.string().max(80).nullable().optional(),
});
export type RuleInput = Omit<z.infer<typeof RuleInputSchema>, "conditions"> & { conditions: AlertCondition[] };

/** Rule types that require the Pro "advanced alerts" feature. */
export const ADVANCED_TYPES: ConditionType[] = ["volatility_above", "regime_change", "forecast_change"];

export function planErrors(input: { conditions: AlertCondition[] }, plan: string | null | undefined, existingCount: number, isNew: boolean): string[] {
  const errs: string[] = [];
  const p = planOf(plan);
  if (isNew && !canCreateAlert(plan, existingCount)) errs.push(`The ${p.name} plan allows ${p.limits.alerts} alert rules.`);
  if (input.conditions.length > 1 && !canUseSmartAlerts(plan)) errs.push("Multi-condition (AND) smart alerts require Pro+.");
  if (input.conditions.some((c) => ADVANCED_TYPES.includes(c.type)) && !canUseAdvancedAlerts(plan)) errs.push("Volatility, regime and forecast alerts require Pro.");
  return errs;
}

export function validateRule(raw: unknown): { ok: true; data: RuleInput } | { ok: false; errors: string[] } {
  const r = RuleInputSchema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data as RuleInput };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join(".") || "rule"}: ${i.message}`) };
}

export function newRuleFromInput(input: RuleInput, id: string, now: number): AlertRule {
  return {
    id,
    name: input.name,
    conditions: input.conditions,
    priority: input.priority,
    cooldownMin: input.cooldownMin,
    channels: input.channels,
    enabled: input.enabled,
    createdAt: now,
    updatedAt: now,
    lastTriggeredAt: null,
    triggerCount: 0,
    watchlistItemId: input.watchlistItemId ?? null,
  };
}
