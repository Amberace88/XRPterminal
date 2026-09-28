"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

/** Route-level error boundary. Reports only message + digest (no user data) and never shows stack traces. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void fetch("/api/health/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: (error.message || "Unknown error").slice(0, 500), digest: error.digest, path: window.location.pathname }),
      keepalive: true,
    }).catch(() => undefined);
  }, [error]);

  return (
    <main id="main" className="flex min-h-[70vh] items-center justify-center bg-bg px-4 py-16">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-warning/10 text-warning">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-fg">Something went wrong</h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-secondary">
          This view failed to load. No data was changed. You can retry, or continue elsewhere — data sources are independent, so other pages may still work.
        </p>
        {error.digest && <p className="mt-2 font-mono text-2xs text-fg-muted">Reference: {error.digest}</p>}
        <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
          <button onClick={reset} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-strong">
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
          <Link href="/dashboard" className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-surface-elevated px-4 text-sm font-medium text-fg hover:bg-surface-hover">
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
