"use client";

import { readLocal } from "@/lib/storage/local";
import { CONSENT_STORAGE_KEY, consentAllows } from "./consent";

export type ProductEventName =
  | "signup"
  | "onboarding_complete"
  | "wallet_connected"
  | "portfolio_view"
  | "future_view"
  | "trade_lab_started"
  | "paper_trade"
  | "strategy_created"
  | "alert_created"
  | "academy_module_completed"
  | "checkout_started"
  | "page_view";

/**
 * Product analytics (spec §327). Sends NOTHING unless the visitor opted in to analytics
 * in the cookie banner. Props must be small and contain no personal data.
 */
export function trackEvent(name: ProductEventName, props?: Record<string, string | number | boolean>): void {
  if (typeof window === "undefined") return;
  if (!consentAllows(readLocal(CONSENT_STORAGE_KEY, null), "analytics")) return;
  try {
    const body = JSON.stringify({ name, props });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/user/events", new Blob([body], { type: "application/json" }));
    else void fetch("/api/user/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  } catch {
    /* analytics must never break the product */
  }
}
