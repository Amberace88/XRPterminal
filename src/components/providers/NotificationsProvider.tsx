"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { readLocal, writeLocal } from "@/lib/storage/local";

/** In-app notification center (spec §180). */
export type NotificationCategory = "market" | "portfolio" | "wallet" | "news" | "forecast" | "tradelab" | "social" | "system";

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body?: string;
  href?: string;
  createdAt: number;
  read: boolean;
  priority: "low" | "normal" | "critical";
  /** dedupe key — identical keys within the cooldown are dropped (spec §127) */
  dedupeKey?: string;
}

interface Ctx {
  items: AppNotification[];
  unread: number;
  notify: (n: Omit<AppNotification, "id" | "createdAt" | "read" | "priority"> & { priority?: AppNotification["priority"]; cooldownMs?: number }) => boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
}

const NotifCtx = createContext<Ctx | null>(null);
const KEY = "notifications";
const DAILY_LIMIT = 50;

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  useEffect(() => setItems(readLocal<AppNotification[]>(KEY, [])), []);
  const persist = (next: AppNotification[]) => {
    writeLocal(KEY, next.slice(0, 200));
    return next.slice(0, 200);
  };

  const notify: Ctx["notify"] = useCallback((n) => {
    const now = Date.now();
    let accepted = false;
    setItems((prev) => {
      const cooldown = n.cooldownMs ?? 15 * 60_000;
      if (n.dedupeKey && prev.some((p) => p.dedupeKey === n.dedupeKey && now - p.createdAt < cooldown)) return prev;
      const today = prev.filter((p) => now - p.createdAt < 86_400_000).length;
      if (today >= DAILY_LIMIT && n.priority !== "critical") return prev;
      accepted = true;
      const item: AppNotification = { ...n, id: `${now}-${Math.random().toString(36).slice(2, 8)}`, createdAt: now, read: false, priority: n.priority ?? "normal" };
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState === "hidden") {
          new Notification(`XRP Terminal — ${n.title}`, { body: n.body, icon: "/icon-192.png" });
        }
      } catch {}
      return persist([item, ...prev]);
    });
    return accepted;
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      items,
      unread: items.filter((i) => !i.read).length,
      notify,
      markRead: (id) => setItems((p) => persist(p.map((i) => (i.id === id ? { ...i, read: true } : i)))),
      markAllRead: () => setItems((p) => persist(p.map((i) => ({ ...i, read: true })))),
      clear: () => setItems(persist([])),
    }),
    [items, notify],
  );
  return <NotifCtx.Provider value={value}>{children}</NotifCtx.Provider>;
}

export function useNotifications(): Ctx {
  const c = useContext(NotifCtx);
  if (!c) throw new Error("useNotifications must be used inside NotificationsProvider");
  return c;
}
