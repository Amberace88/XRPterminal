"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Mail, Pencil, Plus, Server, Smartphone, Trash2, Zap } from "lucide-react";
import { PageHeader, Disclaimer, Switch } from "@/components/ui/Misc";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, SkeletonRows } from "@/components/ui/States";
import { Field } from "@/components/ui/Misc";
import { useMarket } from "@/components/providers/MarketProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { useNotifications } from "@/components/providers/NotificationsProvider";
import { useToast } from "@/components/ui/Toast";
import { useApi, apiPost } from "@/hooks/useApi";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { planOf } from "@/lib/entitlements";
import { describeCondition } from "@/lib/alerts/engine";
import { newId } from "@/lib/alerts/repo";
import { SERVER_EVALUABLE, type AlertRule, type ChannelSettings } from "@/lib/alerts/types";
import { formatAge, formatDateTime } from "@/lib/format";
import { useAlerts } from "./useAlerts";
import { RuleForm, type RuleDraft } from "./RuleForm";
import { Watchlist } from "./Watchlist";

interface Channels {
  inApp: boolean;
  push: boolean;
  email: boolean;
  emailReason: string | null;
  serverEvaluation: boolean;
  telegram: boolean;
  discord: boolean;
}

const PRIORITY_TONE = { low: "neutral", normal: "info", critical: "danger" } as const;

export function AlertsPage() {
  const { ticker } = useMarket();
  const { plan, user } = useAuth();
  const { notify } = useNotifications();
  const toast = useToast();
  const { tz } = usePreferences();
  const { repo, rules, events, settings, error, loading, mode } = useAlerts();
  const channels = useApi<Channels>("/api/alerts/channels", { staleMs: 10 * 60_000 });
  const [form, setForm] = useState<{ open: boolean; rule: AlertRule | null; draft: RuleDraft | null }>({ open: false, rule: null, draft: null });
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const limit = planOf(plan).limits.alerts;
  const emailAvailable = !!channels.data?.email && !!user;

  useEffect(() => {
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  const saveSettings = async (s: ChannelSettings) => {
    try {
      await repo.saveSettings(s);
    } catch (e) {
      toast({ title: "Could not save settings", description: e instanceof Error ? e.message : undefined, tone: "danger" });
    }
  };

  const requestPush = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") saveSettings({ ...settings, push: true });
  };

  const testNotification = async () => {
    const title = "Test alert";
    const body = `Channels OK · ${ticker ? `XRP $${ticker.price}` : "price unavailable"}`;
    if (settings.inApp) notify({ category: "system", title, body, href: "/alerts", dedupeKey: `test:${Date.now()}`, priority: "normal" });
    if (settings.push && perm === "granted") {
      try {
        new Notification(`XRP Terminal — ${title}`, { body, icon: "/icon-192.png" });
      } catch {
        /* some browsers require a service worker */
      }
    }
    if (settings.email && emailAvailable) apiPost("/api/alerts/email", { title, body, test: true }).catch(() => toast({ title: "Email test failed", tone: "warning" }));
    await repo.addEvent({ id: newId(), ruleId: "test", ruleName: "Test", title, body, priority: "normal", createdAt: Date.now(), origin: "test", channels: ["inApp", ...(settings.push ? ["push"] : []), ...(settings.email && emailAvailable ? ["email"] : [])], dedupeKey: `test:${Date.now()}` }).catch(() => undefined);
    toast({ title: "Test notification sent", tone: "success" });
  };

  const remove = async (r: AlertRule) => {
    if (!confirm(`Delete alert “${r.name}”?`)) return;
    await repo.removeRule(r.id).catch((e) => toast({ title: "Delete failed", description: e.message, tone: "danger" }));
  };

  const toggle = (r: AlertRule, enabled: boolean) => repo.saveRule({ ...r, enabled, updatedAt: Date.now() }).catch((e) => toast({ title: "Update failed", description: e.message, tone: "danger" }));

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Alerts"
        description="Price, volatility, volume, regime, wallet, whale, news and forecast alerts — evaluated deterministically with cooldowns, dedupe, daily limits and aggregation so you are not spammed."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={testNotification}>
              <Zap className="h-4 w-4" /> Test notification
            </Button>
            <Button size="sm" onClick={() => setForm({ open: true, rule: null, draft: null })} disabled={(rules?.length ?? 0) >= limit}>
              <Plus className="h-4 w-4" /> New alert
            </Button>
          </>
        }
      />
      {mode === "local" && <p className="-mt-2 mb-4 text-2xs text-fg-muted">Guest mode — data stored in this browser only. Alerts are evaluated while XRP Terminal is open.</p>}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <Card>
            <CardHeader title="Alert rules" icon={<BellRing className="h-4 w-4" />} subtitle={`${rules?.length ?? 0} of ${limit} on the ${planOf(plan).name} plan`} />
            <CardBody>
              {loading ? (
                <SkeletonRows rows={3} />
              ) : !rules?.length ? (
                <EmptyState
                  icon={<Bell className="h-5 w-5" />}
                  title="No alerts yet"
                  description="Create your first alert — e.g. XRP above a price, a 24h move, a wallet sending XRP or a regulation headline."
                  action={
                    <Button size="sm" onClick={() => setForm({ open: true, rule: null, draft: null })}>
                      <Plus className="h-4 w-4" /> New alert
                    </Button>
                  }
                />
              ) : (
                <ul className="space-y-2">
                  {rules.map((r) => {
                    const serverEval = r.conditions.every((c) => SERVER_EVALUABLE.includes(c.type));
                    return (
                      <li key={r.id} className={`rounded-lg border border-border-subtle p-3 transition-opacity ${r.enabled ? "" : "opacity-60"}`}>
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-medium text-fg">{r.name}</span>
                              <Badge tone={PRIORITY_TONE[r.priority]}>{r.priority}</Badge>
                              {r.conditions.length > 1 && <Badge tone="accent">Smart · AND</Badge>}
                              {serverEval && mode === "supabase" && channels.data?.serverEvaluation && (
                                <Badge tone="neutral">
                                  <Server className="h-3 w-3" /> Server
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-fg-secondary">{r.conditions.map(describeCondition).join("  AND  ")}</p>
                            <p className="mt-1 text-2xs text-fg-muted">
                              Cooldown {r.cooldownMin}m · {[r.channels.inApp && "in-app", r.channels.push && "push", r.channels.email && "email"].filter(Boolean).join(", ") || "no channel"} · Last triggered{" "}
                              {r.lastTriggeredAt ? `${formatAge(r.lastTriggeredAt)} (${r.triggerCount}×)` : "never"}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Switch checked={r.enabled} onChange={(v) => toggle(r, v)} label={`Enable ${r.name}`} />
                            <Button variant="ghost" size="xs" onClick={() => setForm({ open: true, rule: r, draft: null })} aria-label={`Edit ${r.name}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="xs" onClick={() => remove(r)} aria-label={`Delete ${r.name}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {error && <p className="mt-2 text-xs text-danger">{error}</p>}
            </CardBody>
          </Card>

          <Watchlist price={ticker?.price ?? null} onCreateAlert={(d) => setForm({ open: true, rule: null, draft: d })} />

          <Card>
            <CardHeader
              title="History"
              subtitle="Triggered alerts (newest first)"
              actions={
                mode === "local" && events?.length ? (
                  <Button variant="ghost" size="xs" onClick={() => repo.clearEvents()}>
                    Clear
                  </Button>
                ) : undefined
              }
            />
            <CardBody>
              {!events ? (
                <SkeletonRows rows={3} />
              ) : !events.length ? (
                <EmptyState icon={<BellOff className="h-5 w-5" />} title="Nothing triggered yet" className="py-6" />
              ) : (
                <ul className="max-h-96 divide-y divide-border-subtle overflow-auto">
                  {events.map((e) => (
                    <li key={e.id} className="flex items-start gap-3 py-2">
                      <Badge tone={PRIORITY_TONE[e.priority]} className="mt-0.5">
                        {e.origin}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-fg">{e.title}</div>
                        <div className="text-2xs text-fg-muted">{e.body}</div>
                      </div>
                      <time className="shrink-0 text-2xs text-fg-muted" dateTime={new Date(e.createdAt).toISOString()}>
                        {formatDateTime(e.createdAt, tz)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader title="Channels" subtitle="Where triggered alerts are delivered" />
            <CardBody className="space-y-3">
              <label className="flex items-center justify-between gap-3 text-xs text-fg-secondary">
                <span className="inline-flex items-center gap-2">
                  <Bell className="h-3.5 w-3.5" /> In-app notification center
                </span>
                <Switch checked={settings.inApp} onChange={(v) => saveSettings({ ...settings, inApp: v })} label="In-app" />
              </label>
              <div className="space-y-1.5">
                <label className="flex items-center justify-between gap-3 text-xs text-fg-secondary">
                  <span className="inline-flex items-center gap-2">
                    <Smartphone className="h-3.5 w-3.5" /> Browser push
                  </span>
                  <Switch checked={settings.push && perm === "granted"} disabled={perm !== "granted"} onChange={(v) => saveSettings({ ...settings, push: v })} label="Browser push" />
                </label>
                {perm === "unsupported" ? (
                  <p className="text-2xs text-fg-muted">Not supported by this browser.</p>
                ) : perm === "denied" ? (
                  <p className="text-2xs text-warning">Blocked in browser settings.</p>
                ) : perm === "default" ? (
                  <Button size="xs" variant="outline" onClick={requestPush}>
                    Allow notifications
                  </Button>
                ) : null}
              </div>
              <div className="space-y-1">
                <label className="flex items-center justify-between gap-3 text-xs text-fg-secondary">
                  <span className="inline-flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5" /> Email
                  </span>
                  <Switch checked={settings.email && emailAvailable} disabled={!emailAvailable} onChange={(v) => saveSettings({ ...settings, email: v })} label="Email" />
                </label>
                {!emailAvailable && <p className="text-2xs text-fg-muted">{!user ? "Email alerts require an account." : (channels.data?.emailReason ?? "Email provider not configured.")}</p>}
              </div>
              <div className="flex items-center justify-between text-xs text-fg-muted">
                Telegram · Discord <Badge tone="neutral">Planned</Badge>
              </div>
              <Field label="Daily notification limit" htmlFor="daily-limit" hint="Critical alerts bypass this limit.">
                <input
                  id="daily-limit"
                  type="number"
                  min={1}
                  max={500}
                  className="input num"
                  defaultValue={settings.dailyLimit}
                  key={settings.dailyLimit}
                  onBlur={(e) => {
                    const n = Math.max(1, Math.min(500, Math.round(Number(e.target.value) || 50)));
                    if (n !== settings.dailyLimit) saveSettings({ ...settings, dailyLimit: n });
                  }}
                />
              </Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="How evaluation works" />
            <CardBody className="space-y-2 text-xs leading-relaxed text-fg-secondary">
              <p>Price, change and volume use the live ticker; volatility and regime use daily candles and the regime engine; wallet and whale alerts watch validated XRPL transactions; news alerts check new headline clusters every 10 minutes.</p>
              <p>Level alerts fire when a condition becomes true (not repeatedly while it stays true). Each rule has a cooldown, identical events are de-duplicated for 24h, and bursts of more than three alerts are combined into one notification.</p>
              <p>
                {channels.data?.serverEvaluation
                  ? "For signed-in users, price/change/volume rules are also checked server-side every 5 minutes, so they fire even when the app is closed (history + email)."
                  : "Alerts are evaluated in your browser while XRP Terminal is open. Server-side evaluation activates when accounts and scheduled jobs are configured."}
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>

      <RuleForm
        open={form.open}
        initial={form.rule}
        draft={form.draft}
        onClose={() => setForm({ open: false, rule: null, draft: null })}
        onSave={(r) => repo.saveRule(r)}
        existingCount={rules?.length ?? 0}
        price={ticker?.price ?? null}
        emailAvailable={emailAvailable}
      />
      <Disclaimer short className="mt-6" />
    </div>
  );
}
