"use client";

import { useState } from "react";
import Link from "next/link";
import { BellPlus, Eye, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, SkeletonRows } from "@/components/ui/States";
import { Field } from "@/components/ui/Misc";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { useTickerRest, type Pair } from "@/hooks/useMarketData";
import { planOf } from "@/lib/entitlements";
import { normalizeXrplAddress } from "@/lib/xrpl/address";
import { formatPct, formatPrice, shortenMiddle } from "@/lib/format";
import { NEWS_CATEGORIES, type NewsCategory } from "@/lib/news/types";
import { newId } from "@/lib/alerts/repo";
import type { AlertCondition, WatchItem, WatchKind } from "@/lib/alerts/types";
import { CATEGORY_LABEL } from "@/components/news/categories";
import { useWatchlist } from "./useAlerts";
import type { RuleDraft } from "./RuleForm";

const PAIRS: Pair[] = ["XRP-USD", "XRP-EUR", "XRP-BTC", "XRP-ETH"];
const KINDS: { value: WatchKind; label: string }[] = [
  { value: "pair", label: "XRP pair" },
  { value: "wallet", label: "Wallet" },
  { value: "topic", label: "News topic" },
  { value: "entity", label: "XRPL entity" },
  { value: "trader", label: "Trader" },
];

function PairPrice({ pair }: { pair: Pair }) {
  const { data } = useTickerRest(pair, 60_000);
  const t = data?.ticker;
  if (!t) return <span className="text-2xs text-fg-muted">—</span>;
  return (
    <span className="num text-xs">
      {formatPrice(t.price, t.quote)} <span className={t.changePct24h && t.changePct24h < 0 ? "text-danger" : "text-success"}>{formatPct(t.changePct24h ?? null)}</span>
    </span>
  );
}

export function draftFor(item: WatchItem, price?: number | null): RuleDraft | null {
  let c: AlertCondition | null = null;
  if (item.kind === "pair" && item.value === "XRP-USD") c = { type: "price_above", value: Number(((price ?? 1) * 1.05).toPrecision(4)) };
  if (item.kind === "wallet") c = { type: "wallet_activity", address: item.value, direction: "any", minXrp: 10_000 };
  if (item.kind === "topic") c = (NEWS_CATEGORIES as readonly string[]).includes(item.value) ? { type: "news", keywords: [], categories: [item.value as NewsCategory] } : { type: "news", keywords: [item.value], categories: [] };
  if (item.kind === "entity") c = { type: "news", keywords: [item.value], categories: [] };
  return c ? { name: `${item.label}`, conditions: [c], watchlistItemId: item.id } : null;
}

/** Watchlist (spec §123, §181): pairs, wallets, traders, topics, XRPL entities. Items can spawn alerts. */
export function Watchlist({ onCreateAlert, price, className, compact = false }: { onCreateAlert?: (d: RuleDraft) => void; price?: number | null; className?: string; compact?: boolean }) {
  const { plan } = useAuth();
  const toast = useToast();
  const { repo, items, loading, error, mode } = useWatchlist();
  const [kind, setKind] = useState<WatchKind>("pair");
  const [value, setValue] = useState<string>("XRP-USD");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const limit = planOf(plan).limits.watchlistItems;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    let v = value.trim();
    if (!v) return setErr("Enter a value.");
    if (kind === "wallet") {
      const n = normalizeXrplAddress(v);
      if (!n.ok) return setErr(n.reason);
      v = n.classic;
    }
    if ((items?.length ?? 0) >= limit) return setErr(`Your plan allows ${limit} watchlist items.`);
    const item: WatchItem = {
      id: newId(),
      kind,
      value: v,
      label: label.trim() || (kind === "wallet" ? shortenMiddle(v, 6, 4) : kind === "topic" && CATEGORY_LABEL[v as NewsCategory] ? CATEGORY_LABEL[v as NewsCategory] : v),
      createdAt: Date.now(),
    };
    try {
      await repo.add(item);
      setLabel("");
      if (kind !== "pair" && kind !== "topic") setValue("");
      toast({ title: "Added to watchlist", tone: "success" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add");
    }
  };

  return (
    <Card className={className}>
      <CardHeader title="Watchlist" icon={<Eye className="h-4 w-4" />} subtitle={`${items?.length ?? 0}/${limit} items${mode === "local" ? " · Guest mode — stored in this browser only" : ""}`} />
      <CardBody className="space-y-3">
        {!compact && (
          <form onSubmit={add} className="grid gap-2 sm:grid-cols-[130px_1fr_1fr_auto] sm:items-end">
            <Field label="Type" htmlFor="wl-kind">
              <select
                id="wl-kind"
                className="select"
                value={kind}
                onChange={(e) => {
                  const k = e.target.value as WatchKind;
                  setKind(k);
                  setValue(k === "pair" ? "XRP-USD" : k === "topic" ? "REGULATION" : "");
                }}
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Value" htmlFor="wl-value">
              {kind === "pair" ? (
                <select id="wl-value" className="select" value={value} onChange={(e) => setValue(e.target.value)}>
                  {PAIRS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              ) : kind === "topic" ? (
                <select id="wl-value" className="select" value={value} onChange={(e) => setValue(e.target.value)}>
                  {NEWS_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              ) : (
                <input id="wl-value" className={`input ${kind === "wallet" ? "font-mono" : ""}`} value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "wallet" ? "r…" : kind === "trader" ? "Trader name or profile id" : "e.g. Bitstamp, AMM, Evernorth"} />
              )}
            </Field>
            <Field label="Label (optional)" htmlFor="wl-label">
              <input id="wl-label" className="input" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
            <Button type="submit" size="md">
              Add
            </Button>
          </form>
        )}
        {(err || error) && <p className="text-xs text-danger">{err ?? error}</p>}
        {loading ? (
          <SkeletonRows rows={3} />
        ) : !items?.length ? (
          <EmptyState title="Your watchlist is empty" description="Add XRP pairs, wallets, news topics, XRPL entities or traders. Items can create alerts." className="py-6" />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {items.map((it) => {
              const d = draftFor(it, price);
              return (
                <li key={it.id} className="flex items-center gap-2 py-2">
                  <Badge tone="neutral" className="w-16 justify-center">
                    {it.kind}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-fg">
                      {it.kind === "wallet" ? (
                        <Link href={`/xrpl/account/${it.value}`} className="hover:text-accent-strong hover:underline">
                          {it.label}
                        </Link>
                      ) : it.kind === "trader" && /^[0-9a-f-]{36}$/i.test(it.value) ? (
                        <Link href={`/social/trader/${it.value}`} className="hover:text-accent-strong hover:underline">
                          {it.label}
                        </Link>
                      ) : (
                        it.label
                      )}
                    </div>
                    {it.kind === "wallet" && <div className="truncate font-mono text-2xs text-fg-muted">{it.value}</div>}
                  </div>
                  {it.kind === "pair" && <PairPrice pair={it.value as Pair} />}
                  {onCreateAlert && d && (
                    <Button variant="ghost" size="xs" onClick={() => onCreateAlert(d)} aria-label={`Create alert for ${it.label}`} title="Create alert">
                      <BellPlus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {!compact && (
                    <Button variant="ghost" size="xs" onClick={() => repo.remove(it.id).catch((e) => setErr(e.message))} aria-label={`Remove ${it.label}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
