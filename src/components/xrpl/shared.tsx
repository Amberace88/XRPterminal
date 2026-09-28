"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, CircleAlert, CircleCheck, CircleX, Radio, Search, Tag } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Hash } from "@/components/ui/Misc";
import { ErrorState } from "@/components/ui/States";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils/cn";
import { formatTime } from "@/lib/format";
import { classifySearch, normalizeXrplAddress } from "@/lib/xrpl/address";
import { formatAmount, type ParsedAmount } from "@/lib/xrpl/amount";
import { primaryLabel, type LabelIndex, type WalletLabel } from "@/lib/xrpl/labels";
import { explainResult } from "@/lib/xrpl/tx";
import type { XrplConnState } from "@/lib/xrpl/client";
import { serverName } from "@/lib/xrpl/hooks";

/* ------------------------------ Connection line ----------------------------- */

const CONN: Record<XrplConnState, { dot: string; text: string; label: string }> = {
  idle: { dot: "bg-fg-muted", text: "text-fg-muted", label: "Idle" },
  connecting: { dot: "bg-info animate-pulse", text: "text-info", label: "Connecting" },
  connected: { dot: "bg-success animate-pulse2", text: "text-success", label: "Connected" },
  reconnecting: { dot: "bg-warning animate-pulse", text: "text-warning", label: "Reconnecting" },
  failed: { dot: "bg-danger", text: "text-danger", label: "Unreachable" },
};

export function XrplConnection({ state, server, className }: { state: XrplConnState; server: string | null; className?: string }) {
  const c = CONN[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-2xs font-medium", c.text, className)} title={server ?? undefined}>
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
      {c.label}
      <span className="truncate text-fg-muted">· {serverName(server)}</span>
    </span>
  );
}

/* --------------------------------- Labels --------------------------------- */

export function LabelBadge({ label, compact }: { label: WalletLabel; compact?: boolean }) {
  const tone = label.source === "user" ? "neutral" : label.source === "on-ledger-domain" ? "warning" : label.category === "EXCHANGE" ? "info" : "accent";
  const suffix = label.source === "user" ? "user-provided" : label.source === "on-ledger-domain" ? "self-declared" : null;
  return (
    <Tooltip
      content={
        <span className="block space-y-1">
          <span className="block font-medium text-fg">{label.name}</span>
          <span className="block">{label.provenance}</span>
          {label.category !== "UNKNOWN" && <span className="block">Category: {label.category.replace("_", " ").toLowerCase()}</span>}
          {label.provenanceUrl && <span className="block break-all text-fg-muted">{label.provenanceUrl}</span>}
        </span>
      }
    >
      <Badge tone={tone} className={cn("max-w-[14rem] normal-case tracking-normal", compact && "px-1 py-0 text-[10px]")}>
        {label.source === "xrpscan-well-known" && label.verified ? <BadgeCheck className="h-3 w-3" /> : <Tag className="h-3 w-3" />}
        <span className="truncate">{label.name}</span>
        {suffix && !compact && <span className="font-normal opacity-70">· {suffix}</span>}
      </Badge>
    </Tooltip>
  );
}

/** Address with link to the account page, shortened with full tooltip, copy, and best label. */
export function AccountRef({
  address,
  labels,
  showLabel = true,
  head = 6,
  tail = 5,
  className,
}: {
  address: string | null | undefined;
  labels?: LabelIndex | null;
  showLabel?: boolean;
  head?: number;
  tail?: number;
  className?: string;
}) {
  if (!address) return <span className="text-fg-muted">—</span>;
  const l = showLabel ? primaryLabel(labels, address) : null;
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-1", className)}>
      <Hash value={address} href={`/xrpl/account/${address}`} head={head} tail={tail} />
      {l && <LabelBadge label={l} compact />}
    </span>
  );
}

export function TxLink({ hash, head = 8, tail = 6 }: { hash: string; head?: number; tail?: number }) {
  return <Hash value={hash} href={`/xrpl/tx/${hash}`} head={head} tail={tail} />;
}

export function AmountText({ amount, className }: { amount: ParsedAmount | null | undefined; className?: string }) {
  if (!amount) return <span className={cn("text-fg-muted", className)}>—</span>;
  return (
    <span className={cn("num", className)}>
      {formatAmount(amount)}
      {amount.issuer && (
        <Tooltip content={<span className="break-all font-mono">Issuer {amount.issuer}</span>}>
          <span className="ml-1 text-2xs text-fg-muted">({amount.issuer.slice(0, 5)}…)</span>
        </Tooltip>
      )}
    </span>
  );
}

export function ResultBadge({ code, className }: { code: string; className?: string }) {
  const r = explainResult(code);
  const tone = r.cls === "success" ? "success" : r.cls === "failed-fee-claimed" ? "danger" : "warning";
  const Icon = r.cls === "success" ? CircleCheck : r.cls === "failed-fee-claimed" ? CircleX : CircleAlert;
  return (
    <Tooltip content={r.explanation}>
      <Badge tone={tone} className={cn("normal-case tracking-normal", className)}>
        <Icon className="h-3 w-3" />
        {code}
      </Badge>
    </Tooltip>
  );
}

/* --------------------------------- Search --------------------------------- */

export function XrplSearch({ className, autoFocus, size = "md" }: { className?: string; autoFocus?: boolean; size?: "md" | "lg" }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = q.trim();
    if (!s) return;
    const kind = classifySearch(s);
    if (kind === "transaction") return router.push(`/xrpl/tx/${s.toUpperCase()}`);
    if (kind === "ledger") return router.push(`/xrpl/ledger/${s}`);
    if (kind === "account") {
      const n = normalizeXrplAddress(s);
      if (n.ok) return router.push(`/xrpl/account/${n.classic}${typeof n.tag === "number" ? `?tag=${n.tag}` : ""}`);
    }
    // token "CUR.issuer" or "CUR:issuer" → issuer account
    const tok = s.match(/^([A-Za-z0-9]{3,40})[.:](r[1-9A-HJ-NP-Za-km-z]{24,34})$/);
    if (tok && normalizeXrplAddress(tok[2]).ok) return router.push(`/xrpl/account/${tok[2]}#tokens`);
    setErr("Enter an XRPL address (r… or X-address), a 64-character transaction hash, a ledger index, or a token as CURRENCY.issuer.");
  };
  return (
    <form onSubmit={submit} className={cn("w-full", className)} role="search">
      <label htmlFor="xrpl-search" className="sr-only">
        Search the XRP Ledger
      </label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
          <input
            id="xrpl-search"
            autoFocus={autoFocus}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setErr(null);
            }}
            spellCheck={false}
            autoComplete="off"
            placeholder="Address, X-address, tx hash, ledger index, token (RLUSD.r…)"
            className={cn("input w-full pl-9 font-mono", size === "lg" ? "h-12 text-sm" : "h-10 text-xs")}
          />
        </div>
        <Button type="submit" size={size === "lg" ? "lg" : "md"}>
          Search
        </Button>
      </div>
      {err && <p className="mt-1.5 text-2xs text-danger">{err}</p>}
    </form>
  );
}

/* ------------------------------ Session banner ------------------------------ */

export function SessionBanner({ startedAt, ledgers, gaps, className }: { startedAt: number | null; ledgers: number; gaps: number; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border-subtle bg-surface-hover/40 px-3 py-2 text-2xs text-fg-secondary", className)} role="status">
      <Radio className="h-3.5 w-3.5 text-accent" />
      {startedAt ? (
        <span>
          Listening since <strong className="num text-fg">{formatTime(startedAt, undefined, false)}</strong> — <strong className="num text-fg">{ledgers}</strong> validated ledger
          {ledgers === 1 ? "" : "s"} observed
          {gaps > 0 && <span className="text-warning"> · {gaps} gap{gaps === 1 ? "" : "s"} after reconnects</span>}
        </span>
      ) : (
        <span>Connecting to the XRP Ledger stream…</span>
      )}
      <span className="text-fg-muted">Session data only — nothing is backfilled.</span>
    </div>
  );
}

export function XrplErrorState({ error, server, onRetry, title }: { error: Error | null; server?: string | null; onRetry?: () => void; title?: string }) {
  return <ErrorState title={title ?? "XRPL request failed"} message={error?.message} provider={`XRPL · ${serverName(server ?? null)}`} onRetry={onRetry} />;
}

export function InlineNote({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "warning" | "info"; className?: string }) {
  return (
    <p
      className={cn(
        "rounded-lg border px-3 py-2 text-2xs leading-relaxed",
        tone === "warning" ? "border-warning/30 bg-warning/[0.06] text-warning" : tone === "info" ? "border-info/30 bg-info/[0.06] text-fg-secondary" : "border-border-subtle bg-surface-hover/40 text-fg-muted",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-2xs font-medium text-accent hover:underline">
      {children}
    </Link>
  );
}
