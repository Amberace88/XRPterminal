"use client";

import type { Ticker } from "@/lib/types/market";

/**
 * Browser real-time ticker streams (spec §21). Each adapter connects to a public
 * exchange WebSocket. The manager falls back to the next venue when one fails,
 * and reports which venue is live so the UI can label the source.
 */

export interface StreamTrade {
  id: string;
  price: number;
  size: number;
  side: "buy" | "sell";
  time: number;
}

export interface StreamCallbacks {
  onTicker: (t: Ticker) => void;
  onTrade?: (t: StreamTrade) => void;
  onStatus: (s: { venue: string; state: "connecting" | "live" | "down" }) => void;
}

interface Adapter {
  id: string;
  name: string;
  url: string;
  subscribe: (ws: WebSocket) => void;
  handle: (msg: unknown, cb: StreamCallbacks) => void;
}

const n = (v: unknown) => Number(v);

const coinbaseAdapter: Adapter = {
  id: "coinbase",
  name: "Coinbase XRP-USD",
  url: "wss://ws-feed.exchange.coinbase.com",
  subscribe: (ws) => ws.send(JSON.stringify({ type: "subscribe", product_ids: ["XRP-USD"], channels: ["ticker", "matches"] })),
  handle: (raw, cb) => {
    const m = raw as Record<string, string>;
    if (m.type === "ticker") {
      const price = n(m.price);
      const open = n(m.open_24h);
      cb.onTicker({
        symbol: "XRP",
        quote: "USD",
        price,
        bid: n(m.best_bid),
        ask: n(m.best_ask),
        open24h: open,
        high24h: n(m.high_24h),
        low24h: n(m.low_24h),
        change24h: price - open,
        changePct24h: open ? ((price - open) / open) * 100 : undefined,
        volume24hBase: n(m.volume_24h),
        volume24hQuote: n(m.volume_24h) * price,
        provenance: {
          source: "Coinbase XRP-USD (WebSocket)",
          provider: "coinbase",
          timestamp: Date.parse(m.time) || Date.now(),
          fetchedAt: Date.now(),
          methodology: "24h change vs Coinbase rolling 24h open.",
        },
      });
    } else if ((m.type === "match" || m.type === "last_match") && cb.onTrade) {
      cb.onTrade({ id: String(m.trade_id), price: n(m.price), size: n(m.size), side: m.side === "sell" ? "buy" : "sell", time: Date.parse(m.time) });
    }
  },
};

const krakenAdapter: Adapter = {
  id: "kraken",
  name: "Kraken XRP/USD",
  url: "wss://ws.kraken.com/v2",
  subscribe: (ws) => {
    ws.send(JSON.stringify({ method: "subscribe", params: { channel: "ticker", symbol: ["XRP/USD"] } }));
    ws.send(JSON.stringify({ method: "subscribe", params: { channel: "trade", symbol: ["XRP/USD"] } }));
  },
  handle: (raw, cb) => {
    const m = raw as { channel?: string; data?: Record<string, unknown>[] };
    if (m.channel === "ticker" && m.data?.[0]) {
      const d = m.data[0];
      const price = n(d.last);
      const change = n(d.change);
      cb.onTicker({
        symbol: "XRP",
        quote: "USD",
        price,
        bid: n(d.bid),
        ask: n(d.ask),
        open24h: price - change,
        high24h: n(d.high),
        low24h: n(d.low),
        change24h: change,
        changePct24h: n(d.change_pct),
        volume24hBase: n(d.volume),
        volume24hQuote: n(d.volume) * n(d.vwap || price),
        provenance: { source: "Kraken XRP/USD (WebSocket)", provider: "kraken", timestamp: Date.now(), fetchedAt: Date.now() },
      });
    } else if (m.channel === "trade" && m.data && cb.onTrade) {
      for (const t of m.data) {
        cb.onTrade({ id: String(t.trade_id), price: n(t.price), size: n(t.qty), side: t.side === "sell" ? "sell" : "buy", time: Date.parse(String(t.timestamp)) });
      }
    }
  },
};

const binanceAdapter: Adapter = {
  id: "binance",
  name: "Binance XRP/USDT",
  url: "wss://data-stream.binance.vision/stream?streams=xrpusdt@ticker/xrpusdt@aggTrade",
  subscribe: () => undefined,
  handle: (raw, cb) => {
    const env = raw as { stream?: string; data?: Record<string, unknown> };
    const d = env.data;
    if (!d) return;
    if (d.e === "24hrTicker") {
      cb.onTicker({
        symbol: "XRP",
        quote: "USD",
        price: n(d.c),
        bid: n(d.b),
        ask: n(d.a),
        open24h: n(d.o),
        high24h: n(d.h),
        low24h: n(d.l),
        change24h: n(d.p),
        changePct24h: n(d.P),
        volume24hBase: n(d.v),
        volume24hQuote: n(d.q),
        provenance: { source: "Binance XRP/USDT (WebSocket, USDT as USD proxy)", provider: "binance", timestamp: n(d.E), fetchedAt: Date.now() },
      });
    } else if (d.e === "aggTrade" && cb.onTrade) {
      cb.onTrade({ id: String(d.a), price: n(d.p), size: n(d.q), side: d.m ? "sell" : "buy", time: n(d.T) });
    }
  },
};

export const STREAM_ADAPTERS = [coinbaseAdapter, krakenAdapter, binanceAdapter];

export function startTickerStream(cb: StreamCallbacks, preferred?: string): () => void {
  let stopped = false;
  let ws: WebSocket | null = null;
  let idx = Math.max(0, STREAM_ADAPTERS.findIndex((a) => a.id === preferred));
  let watchdog: ReturnType<typeof setInterval> | null = null;
  let lastMsg = 0;
  let failures = 0;

  const connect = () => {
    if (stopped) return;
    const a = STREAM_ADAPTERS[idx % STREAM_ADAPTERS.length];
    cb.onStatus({ venue: a.id, state: "connecting" });
    try {
      ws = new WebSocket(a.url);
    } catch {
      next();
      return;
    }
    const sock = ws;
    const openTimer = setTimeout(() => {
      if (sock.readyState !== 1) sock.close();
    }, 8000);
    sock.onopen = () => {
      clearTimeout(openTimer);
      lastMsg = Date.now();
      try {
        a.subscribe(sock);
      } catch {}
    };
    sock.onmessage = (ev) => {
      lastMsg = Date.now();
      failures = 0;
      try {
        const before = lastTickerAt;
        a.handle(JSON.parse(String(ev.data)), {
          ...cb,
          onTicker: (t) => {
            lastTickerAt = Date.now();
            cb.onTicker(t);
            if (!before) cb.onStatus({ venue: a.id, state: "live" });
          },
        });
      } catch {}
    };
    sock.onclose = () => {
      clearTimeout(openTimer);
      if (ws === sock && !stopped) {
        cb.onStatus({ venue: a.id, state: "down" });
        next();
      }
    };
    sock.onerror = () => {
      try {
        sock.close();
      } catch {}
    };
  };
  let lastTickerAt = 0;

  const next = () => {
    if (stopped) return;
    failures++;
    lastTickerAt = 0;
    idx = (idx + 1) % STREAM_ADAPTERS.length;
    const delay = Math.min(15_000, 500 * 2 ** Math.min(failures, 5));
    setTimeout(connect, delay);
  };

  connect();
  watchdog = setInterval(() => {
    // no message for 45s -> consider feed stale, rotate venue
    if (ws && ws.readyState === 1 && lastMsg && Date.now() - lastMsg > 45_000) {
      try {
        ws.close();
      } catch {}
    }
  }, 10_000);

  return () => {
    stopped = true;
    if (watchdog) clearInterval(watchdog);
    try {
      ws?.close();
    } catch {}
    ws = null;
  };
}
