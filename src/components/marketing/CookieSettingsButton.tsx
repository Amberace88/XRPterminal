"use client";

import { CONSENT_EVENT } from "./consent";

/** Re-opens the cookie banner (CookieConsent listens for the "xrpt-open-cookies" window event). */
export function CookieSettingsButton({ className, label = "Cookie settings" }: { className?: string; label?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(CONSENT_EVENT))}>
      {label}
    </button>
  );
}
