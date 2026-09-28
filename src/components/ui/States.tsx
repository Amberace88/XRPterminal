"use client";

import { AlertTriangle, Inbox, PlugZap, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatAge } from "@/lib/format";
import { Button } from "./Button";

/** Skeleton loader — never show misleading zeros while loading (spec §177). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-surface-hover/70", className)} aria-hidden>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
    </div>
  );
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl border border-border-subtle bg-surface-hover text-fg-muted">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-fg-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Error state with retry + last known update + provider (spec §178). */
export function ErrorState({
  title = "Data temporarily unavailable",
  message,
  onRetry,
  lastUpdated,
  provider,
  className,
  compact,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  lastUpdated?: number | null;
  provider?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-1 text-center",
        compact ? "px-3 py-4" : "px-6 py-10",
        className,
      )}
    >
      <AlertTriangle className="mb-1 h-5 w-5 text-warning" />
      <p className="text-sm font-medium text-fg">{title}</p>
      {message && <p className="max-w-md text-xs text-fg-muted">{message}</p>}
      <p className="text-2xs text-fg-muted">
        {provider && <>Provider: {provider} · </>}
        {lastUpdated ? <>Last known update {formatAge(lastUpdated)}</> : <>No previous data</>}
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      )}
    </div>
  );
}

/** Transparent placeholder when an integration is not configured (spec §338). */
export function NotConnected({ what, how, className }: { what: string; how?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-1 px-6 py-10 text-center", className)}>
      <PlugZap className="mb-1 h-5 w-5 text-fg-muted" />
      <p className="text-sm font-medium text-fg">Data source not connected.</p>
      <p className="max-w-md text-xs text-fg-muted">{what}</p>
      {how && <div className="mt-2 max-w-md text-2xs text-fg-muted">{how}</div>}
    </div>
  );
}
