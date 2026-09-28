"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMarket } from "@/components/providers/MarketProvider";
import { useNotifications, type NotificationCategory } from "@/components/providers/NotificationsProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiGet, apiPost, useApi } from "@/hooks/useApi";
import type { CandleSeries } from "@/lib/types/market";
import { getXrplClient } from "@/lib/xrpl/client";
import { readLocal, writeLocal } from "@/lib/storage/local";
import { rollingVolatility } from "@/lib/analytics/indicators";
import { computeRegime, type Regime } from "@/lib/analytics/regime";
import { initialEngineState, runTick, type EngineState } from "@/lib/alerts/engine";
import { extractForecastRange, parseStreamTx } from "@/lib/alerts/inputs";
import { newId } from "@/lib/alerts/repo";
import type { AlertRule, ConditionType, EvalContext, NewsEventInput, WalletTxEvent } from "@/lib/alerts/types";
import type { NewsCluster } from "@/lib/news/types";
import { useAlerts } from "./useAlerts";

/**
 * Client-side alert evaluation loop (spec §124–127). Mount once inside the terminal layout:
 *   <AlertEngineMount />
 * - ticker from useMarket(), daily candles (volatility/regime) only if a rule needs them,
 * - XRPL validated-transaction stream (accounts / whale) via the shared XRPL client,
 * - news polling every 10 min, forecast polling every 15 min (tolerates 404),
 * - portfolio value via window event "xrpt:portfolio-value" ({ detail: { valueUsd } }).
 * Only one browser tab evaluates at a time (localStorage leader lock). Renders nothing.
 */

const TICK_MS = 5_000;
const LEADER_KEY = "alerts:leader";
const STATE_KEY = "alerts:engine";
const REGIME_KEY = "alerts:regime";
const FORECAST_KEY = "alerts:forecast";

const CATEGORY: Record<ConditionType, NotificationCategory> = {
  price_above: "market",
  price_below: "market",
  change_24h: "market",
  volume_above: "market",
  volatility_above: "market",
  regime_change: "forecast",
  forecast_change: "forecast",
  wallet_activity: "wallet",
  whale_tx: "wallet",
  news: "news",
  portfolio_value: "portfolio",
};

function needs(rules: AlertRule[], t: ConditionType[]) {
  return rules.some((r) => r.enabled && r.conditions.some((c) => t.includes(c.type)));
}

export function AlertEngineMount() {
  const { ticker } = useMarket();
  const { notify } = useNotifications();
  const { user } = useAuth();
  const { repo, rules, settings } = useAlerts();
  const active = useMemo(() => (rules ?? []).filter((r) => r.enabled), [rules]);

  const needHistory = needs(active, ["volatility_above", "regime_change"]);
  const needWhale = needs(active, ["whale_tx"]);
  const needNews = needs(active, ["news"]);
  const needForecast = needs(active, ["forecast_change"]);
  const walletAddrs = useMemo(
    () => [...new Set(active.flatMap((r) => r.conditions.flatMap((c) => (c.type === "wallet_activity" && /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(c.address) ? [c.address] : []))))],
    [active],
  );

  // same URL as useDailyHistory → shared client cache; fetched only when a rule needs it
  const history = useApi<CandleSeries>(needHistory ? "/api/market/history?pair=XRP-USD" : null, { staleMs: 30 * 60_000, refreshMs: needHistory ? 60 * 60_000 : undefined });
  const histData = needHistory ? history.data : undefined;

  // mutable inputs shared with the tick loop
  const tabId = useRef(newId());
  const stateRef = useRef<EngineState>(initialEngineState());
  const lastSaved = useRef("");
  const ctxRef = useRef<{ vol30Pct: number | null; regime: Regime | null; prevRegime: Regime | null; portfolio: number | null; forecast: EvalContext["forecast"] }>({
    vol30Pct: null,
    regime: null,
    prevRegime: null,
    portfolio: null,
    forecast: undefined,
  });
  const buffers = useRef<{ wallet: WalletTxEvent[]; whale: WalletTxEvent[]; news: NewsEventInput[] }>({ wallet: [], whale: [], news: [] });
  const tickerRef = useRef(ticker);
  tickerRef.current = ticker;
  const rulesRef = useRef(active);
  rulesRef.current = active;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const signedIn = !!user;
  // refs for values read inside the loop
  const walletAddrsRef = useRef(walletAddrs);
  walletAddrsRef.current = walletAddrs;
  const needWhaleRef = useRef(needWhale);
  needWhaleRef.current = needWhale;
  const needNewsRef = useRef(needNews);
  needNewsRef.current = needNews;
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;

  // restore persisted engine state once
  useEffect(() => {
    stateRef.current = { ...initialEngineState(), ...readLocal<Partial<EngineState>>(STATE_KEY, {}) };
  }, []);

  // volatility + regime from daily candles (only when a rule needs them)
  useEffect(() => {
    const c = histData?.candles;
    if (!c || c.length < 40) return;
    const vol = rollingVolatility(
      c.map((x) => x.c),
      30,
    );
    const v = vol[vol.length - 1];
    ctxRef.current.vol30Pct = v !== null && v !== undefined ? v * 100 : null;
    const reg = computeRegime(c);
    if (reg.regime === "UNKNOWN") return;
    const prev = readLocal<Regime | null>(REGIME_KEY, null);
    ctxRef.current.prevRegime = prev ?? reg.regime;
    ctxRef.current.regime = reg.regime;
    writeLocal(REGIME_KEY, reg.regime);
  }, [histData]);

  // XRPL streams: accounts for wallet rules, full validated tx stream for whale rules
  const subscribed = useRef<{ accounts: Set<string>; tx: boolean }>({ accounts: new Set(), tx: false });
  useEffect(() => {
    if (!walletAddrs.length && !needWhale) return;
    const client = getXrplClient();
    const off = client.onMessage((msg) => {
      const ev = parseStreamTx(msg as Record<string, unknown>);
      if (!ev) return;
      const watched = walletAddrs.includes(ev.account) || (ev.destination ? walletAddrs.includes(ev.destination) : false);
      if (watched) buffers.current.wallet.push(ev);
      if (needWhale && ev.amountXrp >= 100_000) buffers.current.whale.push(ev);
      for (const k of ["wallet", "whale"] as const) if (buffers.current[k].length > 500) buffers.current[k].splice(0, 250);
    });
    const newAccounts = walletAddrs.filter((a) => !subscribed.current.accounts.has(a));
    if (newAccounts.length) {
      newAccounts.forEach((a) => subscribed.current.accounts.add(a));
      client.subscribe({ accounts: newAccounts }).catch(() => newAccounts.forEach((a) => subscribed.current.accounts.delete(a)));
    }
    if (needWhale && !subscribed.current.tx) {
      subscribed.current.tx = true;
      client.subscribe({ streams: ["transactions"] }).catch(() => (subscribed.current.tx = false));
    }
    // Streams are shared with other modules, so we don't unsubscribe on cleanup.
    return () => {
      off();
    };
  }, [walletAddrs, needWhale]);

  // News polling: new clusters since the engine started become events
  useEffect(() => {
    if (!needNews) return;
    let seen: Set<string> | null = null;
    let stop = false;
    const poll = async () => {
      try {
        const d = await apiGet<{ clusters: NewsCluster[] }>("/api/news?relevance=xrp&limit=60");
        if (stop) return;
        if (!seen) {
          seen = new Set(d.clusters.map((c) => c.id));
          return;
        }
        for (const c of d.clusters) {
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          buffers.current.news.push({ id: c.id, title: c.title, categories: c.categories, url: c.lead.url, source: c.lead.source });
        }
      } catch {
        /* news unavailable → condition not evaluable this tick */
      }
    };
    poll();
    const id = setInterval(poll, 10 * 60_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [needNews]);

  // Forecast polling (Future module endpoint; tolerate 404 / unknown shape)
  useEffect(() => {
    if (!needForecast) return;
    let stop = false;
    const poll = async () => {
      try {
        const d = await apiGet<unknown>("/api/forecast/current");
        const cur = extractForecastRange(d);
        if (stop || !cur) return;
        const prev = readLocal<{ low: number; high: number } | null>(FORECAST_KEY, null);
        ctxRef.current.forecast = { current: cur, previous: prev ?? cur };
        writeLocal(FORECAST_KEY, cur);
      } catch {
        ctxRef.current.forecast = undefined; // 404 or unavailable
      }
    };
    poll();
    const id = setInterval(poll, 15 * 60_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [needForecast]);

  // Portfolio value published by the Portfolio module (optional)
  useEffect(() => {
    const h = (e: Event) => {
      const v = (e as CustomEvent<{ valueUsd?: number }>).detail?.valueUsd;
      if (typeof v === "number" && Number.isFinite(v)) ctxRef.current.portfolio = v;
    };
    window.addEventListener("xrpt:portfolio-value", h);
    return () => window.removeEventListener("xrpt:portfolio-value", h);
  }, []);

  // Evaluation loop
  useEffect(() => {
    const isLeader = () => {
      const now = Date.now();
      const l = readLocal<{ id: string; ts: number } | null>(LEADER_KEY, null);
      if (!l || l.id === tabId.current || now - l.ts > 15_000) {
        writeLocal(LEADER_KEY, { id: tabId.current, ts: now });
        return true;
      }
      return false;
    };
    const tick = async () => {
      const rs = rulesRef.current;
      if (!rs.length) {
        buffers.current = { wallet: [], whale: [], news: [] };
        return;
      }
      if (!isLeader()) return;
      const t = tickerRef.current;
      const c = ctxRef.current;
      const b = buffers.current;
      buffers.current = { wallet: [], whale: [], news: [] };
      const ctx: EvalContext = {
        now: Date.now(),
        price: t?.price ?? null,
        changePct24h: t?.changePct24h ?? null,
        volume24hQuote: t?.volume24hQuote ?? null,
        vol30Pct: c.vol30Pct,
        regime: c.regime,
        prevRegime: c.prevRegime,
        walletTxs: walletAddrsRef.current.length ? b.wallet : undefined,
        whaleTxs: needWhaleRef.current ? b.whale : undefined,
        news: needNewsRef.current ? b.news : undefined,
        forecast: c.forecast,
        portfolioValueUsd: c.portfolio,
      };
      const s = settingsRef.current;
      const res = runTick(rs, ctx, stateRef.current, { dailyLimit: s.dailyLimit });
      stateRef.current = res.state;
      // regime / forecast events are consumed once
      if (c.regime) c.prevRegime = c.regime;
      if (c.forecast?.current) c.forecast = { current: c.forecast.current, previous: c.forecast.current };
      const json = JSON.stringify(res.state);
      if (json !== lastSaved.current) {
        lastSaved.current = json;
        writeLocal(STATE_KEY, res.state);
      }
      if (!res.fired.length) return;

      const byId = new Map(rs.map((r) => [r.id, r]));
      for (const n of res.notices) {
        const rule = byId.get(n.ruleIds[0]);
        const cat = rule ? CATEGORY[rule.conditions[0].type] : "system";
        const wantsInApp = n.ruleIds.some((id) => byId.get(id)?.channels.inApp);
        if (s.inApp && wantsInApp) notify({ category: cat, title: n.title, body: n.body, href: "/alerts", dedupeKey: n.dedupeKey, priority: n.priority, cooldownMs: 60_000 });
        const wantsEmail = n.ruleIds.some((id) => byId.get(id)?.channels.email);
        if (s.email && wantsEmail && signedInRef.current) apiPost("/api/alerts/email", { title: n.title, body: n.body }).catch(() => undefined);
      }
      for (const f of res.fired) {
        const rule = byId.get(f.ruleId);
        if (!rule) continue;
        const channels = [rule.channels.inApp && s.inApp && "inApp", rule.channels.push && s.push && "push", rule.channels.email && s.email && "email"].filter(Boolean) as string[];
        await repo
          .addEvent({ id: newId(), ruleId: rule.id, ruleName: rule.name, title: f.title, body: f.body, priority: f.priority, createdAt: ctx.now, origin: "client", channels, dedupeKey: f.dedupeKey })
          .catch(() => undefined);
        await repo.saveRule({ ...rule, lastTriggeredAt: ctx.now, triggerCount: rule.triggerCount + 1 }).catch(() => undefined);
      }
    };
    const id = setInterval(() => void tick(), TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, notify]);

  return null;
}
