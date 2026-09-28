"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { readLocal, writeLocal } from "@/lib/storage/local";
import { SERVER_EVALUABLE, DEFAULT_CHANNEL_SETTINGS, type AlertEvent, type AlertRule, type ChannelSettings, type WatchItem } from "./types";

/**
 * Guest vs account persistence (ARCHITECTURE: repo pattern).
 * Guest → browser storage; signed-in + Supabase → tables with RLS (plan limits enforced by DB trigger).
 */
export const ALERTS_CHANGED_EVENT = "xrpt-alerts-changed";
const K = { rules: "alerts:rules", events: "alerts:events", settings: "alerts:settings", watch: "watchlist:items" } as const;

function emit() {
  try {
    window.dispatchEvent(new CustomEvent(ALERTS_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export interface AlertsRepo {
  mode: "local" | "supabase";
  listRules(): Promise<AlertRule[]>;
  saveRule(rule: AlertRule): Promise<void>;
  removeRule(id: string): Promise<void>;
  listEvents(limit?: number): Promise<AlertEvent[]>;
  addEvent(e: AlertEvent): Promise<void>;
  clearEvents(): Promise<void>;
  getSettings(): Promise<ChannelSettings>;
  saveSettings(s: ChannelSettings): Promise<void>;
}

function localRepo(): AlertsRepo {
  return {
    mode: "local",
    async listRules() {
      return readLocal<AlertRule[]>(K.rules, []);
    },
    async saveRule(rule) {
      const all = readLocal<AlertRule[]>(K.rules, []);
      const i = all.findIndex((r) => r.id === rule.id);
      if (i >= 0) all[i] = rule;
      else all.unshift(rule);
      writeLocal(K.rules, all);
      emit();
    },
    async removeRule(id) {
      writeLocal(
        K.rules,
        readLocal<AlertRule[]>(K.rules, []).filter((r) => r.id !== id),
      );
      emit();
    },
    async listEvents(limit = 200) {
      return readLocal<AlertEvent[]>(K.events, []).slice(0, limit);
    },
    async addEvent(e) {
      writeLocal(K.events, [e, ...readLocal<AlertEvent[]>(K.events, [])].slice(0, 300));
      emit();
    },
    async clearEvents() {
      writeLocal(K.events, []);
      emit();
    },
    async getSettings() {
      return { ...DEFAULT_CHANNEL_SETTINGS, ...readLocal<Partial<ChannelSettings>>(K.settings, {}) };
    },
    async saveSettings(s) {
      writeLocal(K.settings, s);
      emit();
    },
  };
}

interface RuleRow {
  id: string;
  name: string;
  conditions: AlertRule["conditions"];
  priority: AlertRule["priority"];
  cooldown_min: number;
  channels: AlertRule["channels"];
  enabled: boolean;
  created_at: string;
  updated_at: string;
  last_triggered_at: string | null;
  trigger_count: number;
  watchlist_item_id: string | null;
}

const toRule = (r: RuleRow): AlertRule => ({
  id: r.id,
  name: r.name,
  conditions: r.conditions,
  priority: r.priority,
  cooldownMin: r.cooldown_min,
  channels: r.channels,
  enabled: r.enabled,
  createdAt: Date.parse(r.created_at),
  updatedAt: Date.parse(r.updated_at),
  lastTriggeredAt: r.last_triggered_at ? Date.parse(r.last_triggered_at) : null,
  triggerCount: r.trigger_count ?? 0,
  watchlistItemId: r.watchlist_item_id,
});

function supabaseRepo(sb: SupabaseClient, userId: string): AlertsRepo {
  const fail = (e: { message: string } | null) => {
    if (e) throw new Error(e.message);
  };
  return {
    mode: "supabase",
    async listRules() {
      const { data, error } = await sb.from("alert_rules").select("*").eq("user_id", userId).order("created_at", { ascending: false });
      fail(error);
      return ((data ?? []) as RuleRow[]).map(toRule);
    },
    async saveRule(rule) {
      const { error } = await sb.from("alert_rules").upsert({
        id: rule.id,
        user_id: userId,
        name: rule.name,
        conditions: rule.conditions,
        priority: rule.priority,
        cooldown_min: rule.cooldownMin,
        channels: rule.channels,
        enabled: rule.enabled,
        server_eval: rule.conditions.every((c) => SERVER_EVALUABLE.includes(c.type)),
        last_triggered_at: rule.lastTriggeredAt ? new Date(rule.lastTriggeredAt).toISOString() : null,
        trigger_count: rule.triggerCount,
        watchlist_item_id: rule.watchlistItemId ?? null,
      });
      fail(error);
      emit();
    },
    async removeRule(id) {
      const { error } = await sb.from("alert_rules").delete().eq("id", id).eq("user_id", userId);
      fail(error);
      emit();
    },
    async listEvents(limit = 200) {
      const { data, error } = await sb.from("alert_events").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
      fail(error);
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        ruleId: String(r.rule_id ?? ""),
        ruleName: String(r.rule_name ?? ""),
        title: String(r.title ?? ""),
        body: String(r.body ?? ""),
        priority: (r.priority as AlertEvent["priority"]) ?? "normal",
        createdAt: Date.parse(String(r.created_at)),
        origin: (r.origin as AlertEvent["origin"]) ?? "client",
        channels: (r.channels as string[]) ?? [],
        dedupeKey: String(r.dedupe_key ?? ""),
        suppressed: (r.suppressed as AlertEvent["suppressed"]) ?? null,
      }));
    },
    async addEvent(e) {
      const { error } = await sb.from("alert_events").insert({
        user_id: userId,
        rule_id: /^[0-9a-f-]{36}$/i.test(e.ruleId) ? e.ruleId : null,
        rule_name: e.ruleName,
        title: e.title,
        body: e.body,
        priority: e.priority,
        origin: e.origin,
        channels: e.channels,
        dedupe_key: e.dedupeKey,
        suppressed: e.suppressed ?? null,
      });
      fail(error);
      emit();
    },
    async clearEvents() {
      // alert history is append-only in the database (audit trail)
      throw new Error("Alert history is kept as an audit trail for signed-in accounts.");
    },
    async getSettings() {
      const { data } = await sb.from("alert_settings").select("*").eq("user_id", userId).maybeSingle();
      if (!data) return DEFAULT_CHANNEL_SETTINGS;
      return { inApp: data.in_app, push: data.push, email: data.email, dailyLimit: data.daily_limit };
    },
    async saveSettings(s) {
      const { error } = await sb.from("alert_settings").upsert({ user_id: userId, in_app: s.inApp, push: s.push, email: s.email, daily_limit: s.dailyLimit });
      fail(error);
      emit();
    },
  };
}

export function getAlertsRepo(userId: string | null): AlertsRepo {
  const sb = userId ? getSupabaseBrowser() : null;
  return sb && userId ? supabaseRepo(sb, userId) : localRepo();
}

/* ------------------------------- Watchlist ------------------------------- */

export interface WatchlistRepo {
  mode: "local" | "supabase";
  list(): Promise<WatchItem[]>;
  add(item: WatchItem): Promise<void>;
  remove(id: string): Promise<void>;
}

export const WATCHLIST_CHANGED_EVENT = "xrpt-watchlist-changed";
function emitWatch() {
  try {
    window.dispatchEvent(new CustomEvent(WATCHLIST_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

export function getWatchlistRepo(userId: string | null): WatchlistRepo {
  const sb = userId ? getSupabaseBrowser() : null;
  if (sb && userId) {
    return {
      mode: "supabase",
      async list() {
        const { data, error } = await sb.from("watchlist_items").select("id, kind, value, label, created_at").eq("user_id", userId).order("created_at", { ascending: false });
        if (error) throw new Error(error.message);
        return (data ?? []).map((r) => ({ id: r.id as string, kind: r.kind as WatchItem["kind"], value: r.value as string, label: (r.label as string) ?? (r.value as string), createdAt: Date.parse(r.created_at as string) }));
      },
      async add(item) {
        const { error } = await sb.from("watchlist_items").insert({ id: item.id, user_id: userId, kind: item.kind, value: item.value, label: item.label });
        if (error) throw new Error(error.code === "23505" ? "Already on your watchlist." : error.message);
        emitWatch();
      },
      async remove(id) {
        const { error } = await sb.from("watchlist_items").delete().eq("id", id).eq("user_id", userId);
        if (error) throw new Error(error.message);
        emitWatch();
      },
    };
  }
  return {
    mode: "local",
    async list() {
      return readLocal<WatchItem[]>(K.watch, []);
    },
    async add(item) {
      const all = readLocal<WatchItem[]>(K.watch, []);
      if (all.some((x) => x.kind === item.kind && x.value.toLowerCase() === item.value.toLowerCase())) throw new Error("Already on your watchlist.");
      writeLocal(K.watch, [item, ...all]);
      emitWatch();
    },
    async remove(id) {
      writeLocal(
        K.watch,
        readLocal<WatchItem[]>(K.watch, []).filter((x) => x.id !== id),
      );
      emitWatch();
    },
  };
}
