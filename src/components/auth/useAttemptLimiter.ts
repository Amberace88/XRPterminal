"use client";

import { useCallback, useEffect, useState } from "react";
import { readLocal, writeLocal } from "@/lib/storage/local";

/**
 * Client-side attempt limiter for auth forms (UX layer — Supabase Auth enforces the real
 * server-side rate limits). After `max` failures within `windowMs`, the form locks with a
 * visible countdown; each further lock doubles, up to 15 minutes.
 */
interface LimiterState {
  failures: number[];
  lockedUntil: number;
  locks: number;
}

export function useAttemptLimiter(scope: string, max = 5, windowMs = 10 * 60_000) {
  const key = `auth-limit:${scope}`;
  const [state, setState] = useState<LimiterState>({ failures: [], lockedUntil: 0, locks: 0 });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => setState(readLocal<LimiterState>(key, { failures: [], lockedUntil: 0, locks: 0 })), [key]);
  useEffect(() => {
    if (state.lockedUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.lockedUntil]);

  const fail = useCallback(
    (serverRetryAfterSec?: number) => {
      const t = Date.now();
      setState((prev) => {
        const failures = [...prev.failures.filter((f) => t - f < windowMs), t];
        let { lockedUntil, locks } = prev;
        if (serverRetryAfterSec) lockedUntil = Math.max(lockedUntil, t + serverRetryAfterSec * 1000);
        let next: LimiterState;
        if (failures.length >= max) {
          locks += 1;
          lockedUntil = Math.max(lockedUntil, t + Math.min(15 * 60_000, 60_000 * 2 ** (locks - 1)));
          next = { failures: [], lockedUntil, locks };
        } else next = { failures, lockedUntil, locks };
        writeLocal(key, next);
        return next;
      });
      setNow(t);
    },
    [key, max, windowMs],
  );

  const succeed = useCallback(() => {
    const next = { failures: [], lockedUntil: 0, locks: 0 };
    writeLocal(key, next);
    setState(next);
  }, [key]);

  const remainingMs = Math.max(0, state.lockedUntil - now);
  return {
    locked: remainingMs > 0,
    remainingSec: Math.ceil(remainingMs / 1000),
    attemptsLeft: Math.max(0, max - state.failures.filter((f) => now - f < windowMs).length),
    fail,
    succeed,
  };
}

/** Map Supabase auth errors to clear, non-enumerating messages. */
export function authErrorMessage(err: { message?: string; status?: number; code?: string } | null | undefined): { message: string; rateLimited: boolean } {
  if (!err) return { message: "Something went wrong. Please try again.", rateLimited: false };
  const msg = (err.message ?? "").toLowerCase();
  if (err.status === 429 || msg.includes("rate limit") || msg.includes("too many")) {
    return { message: "Too many attempts. Please wait a moment before trying again.", rateLimited: true };
  }
  if (msg.includes("invalid login credentials")) return { message: "Email or password is incorrect.", rateLimited: false };
  if (msg.includes("email not confirmed")) return { message: "Please verify your email address first — check your inbox for the confirmation link.", rateLimited: false };
  if (msg.includes("password should be") || msg.includes("weak password")) return { message: "That password is too weak. Use at least 10 characters with letters and numbers.", rateLimited: false };
  if (msg.includes("same password") || msg.includes("different from the old")) return { message: "Choose a password you haven't used for this account before.", rateLimited: false };
  if (msg.includes("signups not allowed") || msg.includes("signup is disabled")) return { message: "New sign-ups are currently closed.", rateLimited: false };
  if (msg.includes("network") || msg.includes("fetch")) return { message: "Network error — check your connection and try again.", rateLimited: false };
  return { message: err.message || "Something went wrong. Please try again.", rateLimited: false };
}

/** Tell the server about a completed auth action (audit + security notifications). Best-effort. */
export function reportAuthEvent(event: "login" | "logout" | "password_changed" | "sessions_revoked", method?: "password" | "magic_link" | "oauth" | "email_link") {
  return fetch("/api/auth/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, method }),
    keepalive: true,
  }).catch(() => undefined);
}
