"use client";

import { useEffect } from "react";
import { readLocal, writeLocal } from "@/lib/storage/local";

/**
 * Captures ?ref=CODE on public pages: stores it (30 days) so signup can attribute it,
 * and records one click per code per browser session. No tracking beyond that.
 */
export const REFERRAL_KEY = "referral";
const CODE_RE = /^[a-z0-9-]{4,32}$/i;

export function getStoredReferral(): string | null {
  const r = readLocal<{ code: string; at: number } | null>(REFERRAL_KEY, null);
  if (!r || !CODE_RE.test(r.code) || Date.now() - r.at > 30 * 86_400_000) return null;
  return r.code;
}

export function ReferralCapture() {
  useEffect(() => {
    let code: string | null = null;
    try {
      code = new URLSearchParams(window.location.search).get("ref");
    } catch {
      return;
    }
    if (!code || !CODE_RE.test(code)) return;
    code = code.toLowerCase();
    writeLocal(REFERRAL_KEY, { code, at: Date.now() });
    const sessionKey = `xrpt:ref-click:${code}`;
    try {
      if (sessionStorage.getItem(sessionKey)) return;
      sessionStorage.setItem(sessionKey, "1");
    } catch {
      /* ignore */
    }
    void fetch("/api/referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, path: window.location.pathname }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);
  return null;
}
