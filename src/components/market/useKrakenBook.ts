"use client";

import { useEffect, useRef, useState } from "react";
import { applyBookUpdate, bookFromSnapshot, type BookMessageData, type BookState } from "@/lib/analytics/orderbook";

/**
 * Client-side Kraken WebSocket v2 order-book subscription (public, no auth).
 * wss://ws.kraken.com/v2 · {"method":"subscribe","params":{"channel":"book","symbol":["XRP/USD"],"depth":10}}
 * Status is honest: LIVE only while messages (book or heartbeat) keep arriving.
 */
export type BookStatus = "connecting" | "live" | "stale" | "unavailable";

const URL = "wss://ws.kraken.com/v2";
const STALE_MS = 15_000;
const MAX_RETRIES = 5;

export function useKrakenBook(symbol: string | null, depth: 10 | 25 = 10) {
  const [book, setBook] = useState<BookState | null>(null);
  const [status, setStatus] = useState<BookStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [lastMsg, setLastMsg] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const bookRef = useRef<BookState | null>(null);
  const lastRef = useRef(0);

  useEffect(() => {
    if (!symbol || typeof WebSocket === "undefined") {
      setStatus("unavailable");
      return;
    }
    let stopped = false;
    let ws: WebSocket | null = null;
    let retries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    bookRef.current = null;
    setBook(null);
    setError(null);
    setStatus("connecting");

    // batch renders (~6/s) — the book can update many times per second
    const scheduleFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        setBook(bookRef.current);
        setLastMsg(lastRef.current);
      }, 160);
    };

    const connect = () => {
      if (stopped) return;
      try {
        ws = new WebSocket(URL);
      } catch {
        fail("WebSocket could not be opened in this browser.");
        return;
      }
      const sock = ws;
      sock.onopen = () => {
        sock.send(JSON.stringify({ method: "subscribe", params: { channel: "book", symbol: [symbol], depth } }));
      };
      sock.onmessage = (ev) => {
        let m: { channel?: string; type?: string; method?: string; success?: boolean; error?: string; data?: BookMessageData[] };
        try {
          m = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (m.method === "subscribe" && m.success === false) {
          stopped = true;
          setError(m.error ?? "Subscription rejected by venue");
          setStatus("unavailable");
          sock.close();
          return;
        }
        if (m.channel === "heartbeat" || m.channel === "status") {
          lastRef.current = Date.now();
          return;
        }
        if (m.channel !== "book" || !m.data?.[0]) return;
        const d = m.data[0];
        if (d.symbol && d.symbol !== symbol) return;
        const now = Date.now();
        lastRef.current = now;
        retries = 0;
        if (m.type === "snapshot") bookRef.current = bookFromSnapshot(d, depth, now);
        else if (m.type === "update" && bookRef.current) bookRef.current = applyBookUpdate(bookRef.current, d, now);
        else return;
        setStatus("live");
        scheduleFlush();
      };
      sock.onclose = () => {
        if (stopped || ws !== sock) return;
        retries++;
        if (retries > MAX_RETRIES) {
          fail("Order-book stream disconnected repeatedly.");
          return;
        }
        setStatus(bookRef.current ? "stale" : "connecting");
        retryTimer = setTimeout(connect, Math.min(15_000, 1000 * 2 ** retries));
      };
      sock.onerror = () => {
        try {
          sock.close();
        } catch {
          /* ignore */
        }
      };
    };

    const fail = (msg: string) => {
      setError(msg);
      setStatus(bookRef.current ? "stale" : "unavailable");
    };

    connect();
    const watchdog = setInterval(() => {
      if (lastRef.current && Date.now() - lastRef.current > STALE_MS) {
        setStatus((s) => (s === "live" ? "stale" : s));
        // force a reconnect on silence
        if (ws && ws.readyState === 1) ws.close();
      }
    }, 5000);

    return () => {
      stopped = true;
      clearInterval(watchdog);
      if (retryTimer) clearTimeout(retryTimer);
      if (flushTimer) clearTimeout(flushTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      ws = null;
    };
  }, [symbol, depth, attempt]);

  return { book, status, error, lastMsg, venue: "Kraken", retry: () => setAttempt((a) => a + 1) };
}
