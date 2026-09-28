"use client";

import { useEffect } from "react";
import "./globals.css";

/** Last-resort boundary (replaces the root layout). Minimal, on-brand, no stack traces. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void fetch("/api/health/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: `[global] ${(error.message || "Unknown error").slice(0, 480)}`, digest: error.digest, path: window.location.pathname }),
      keepalive: true,
    }).catch(() => undefined);
  }, [error]);

  return (
    <html lang="en" data-theme="dark">
      <body className="bg-bg text-fg">
        <main className="flex min-h-screen items-center justify-center px-4">
          <div className="max-w-md text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- next/image may be unavailable when the app shell has crashed */}
            <img src="/brand/mark-128.png" alt="XRP Terminal" width={64} height={64} className="mx-auto h-16 w-16" />
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">XRP Terminal hit an unexpected error</h1>
            <p className="mt-2 text-sm leading-relaxed text-fg-secondary">Please reload. If this keeps happening, try again in a few minutes.</p>
            {error.digest && <p className="mt-2 font-mono text-xs text-fg-muted">Reference: {error.digest}</p>}
            <button onClick={reset} className="mt-7 inline-flex h-10 items-center justify-center rounded-lg bg-accent px-5 text-sm font-medium text-white hover:bg-accent-strong">
              Reload
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
