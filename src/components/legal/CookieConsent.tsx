"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readLocal, writeLocal } from "@/lib/storage/local";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Misc";

export interface CookieChoice {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  decidedAt: number;
}

/**
 * Cookie management (spec §196). Only strictly necessary storage is used unless the
 * visitor opts in. XRP Terminal currently ships NO analytics or marketing trackers —
 * the switches exist so future integrations respect prior consent.
 */
export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const c = readLocal<CookieChoice | null>("cookie-consent", null);
    if (!c) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener("xrpt-open-cookies", reopen);
    return () => window.removeEventListener("xrpt-open-cookies", reopen);
  }, []);

  const save = (a: boolean, m: boolean) => {
    writeLocal<CookieChoice>("cookie-consent", { necessary: true, analytics: a, marketing: m, decidedAt: Date.now() });
    setOpen(false);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-x-3 bottom-20 z-[75] mx-auto max-w-xl rounded-2xl border border-border bg-surface-elevated p-4 shadow-2xl animate-fade-up lg:bottom-4" role="dialog" aria-label="Cookie preferences">
      <p className="text-sm font-medium text-fg">Privacy & cookies</p>
      <p className="mt-1 text-xs leading-relaxed text-fg-muted">
        We use strictly necessary storage (session, preferences, guest-mode data). Optional analytics and marketing cookies are off unless you allow them. See our{" "}
        <Link href="/legal/cookies" className="text-accent hover:underline">
          cookie policy
        </Link>
        .
      </p>
      {details && (
        <div className="mt-3 space-y-2 rounded-lg border border-border-subtle p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-fg-secondary">Strictly necessary</span>
            <span className="text-fg-muted">Always on</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-fg-secondary">Analytics</span>
            <Switch checked={analytics} onChange={setAnalytics} label="Analytics cookies" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-fg-secondary">Marketing</span>
            <Switch checked={marketing} onChange={setMarketing} label="Marketing cookies" />
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {details ? (
          <Button size="sm" variant="secondary" onClick={() => save(analytics, marketing)}>
            Save choices
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setDetails(true)}>
            Customize
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => save(false, false)}>
          Necessary only
        </Button>
        <Button size="sm" onClick={() => save(true, true)}>
          Accept all
        </Button>
      </div>
    </div>
  );
}
