"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, Bookmark, Fish, Waypoints } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { TrustBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/States";
import { useAuth } from "@/components/providers/AuthProvider";
import { getWatchlistRepo, WATCHLIST_CHANGED_EVENT } from "@/lib/alerts/repo";
import type { WatchItem } from "@/lib/alerts/types";
import { LedgerStreamPanel } from "./LedgerStream";
import { NetworkStats } from "./NetworkStats";
import { AccountRef, XrplSearch } from "./shared";
import { useLabels } from "./useLabels";

const TOOLS = [
  {
    href: "/xrpl/whales",
    title: "Whale transfers",
    icon: Fish,
    desc: "Live feed of large XRP payments, measured by the amount actually delivered. Labelled exchange flows only where a public label exists.",
  },
  {
    href: "/xrpl/activity",
    title: "Network activity",
    icon: Activity,
    desc: "Transactions per ledger, type mix, fees, new accounts, payment volume and DEX activity — observed live in this session. Plus RLUSD on-ledger data.",
  },
  {
    href: "/xrpl/graph",
    title: "Entity graph",
    icon: Waypoints,
    desc: "Visualise observed payment flows around an address. Edges are payments only — ownership is never inferred.",
    beta: true,
  },
];

export function XrplHub() {
  return (
    <div className="space-y-4">
      <Card className="grid-bg">
        <CardBody className="py-6 sm:py-8">
          <p className="label mb-2">Search the XRP Ledger</p>
          <XrplSearch size="lg" autoFocus={false} />
          <p className="mt-2 text-2xs text-fg-muted">
            Accepts classic addresses (r…), X-addresses (normalised to classic + tag), 64-character transaction hashes, ledger indexes, and tokens as <span className="font-mono">CURRENCY.issuer</span>.
          </p>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-12">
        <LedgerStreamPanel className="lg:col-span-8" />
        <NetworkStats className="lg:col-span-4" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="card group flex flex-col gap-2 p-4 transition-colors hover:border-accent/40">
            <div className="flex items-center gap-2">
              <t.icon className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold text-fg">{t.title}</h2>
              {t.beta && <TrustBadge kind="BETA" />}
              <ArrowRight className="ml-auto h-4 w-4 text-fg-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </div>
            <p className="text-xs leading-relaxed text-fg-secondary">{t.desc}</p>
          </Link>
        ))}
      </div>

      <WatchedWallets />
    </div>
  );
}

function WatchedWallets() {
  const { user } = useAuth();
  const [items, setItems] = useState<WatchItem[] | null>(null);
  const { index } = useLabels();
  useEffect(() => {
    const repo = getWatchlistRepo(user?.id ?? null);
    const load = () =>
      repo
        .list()
        .then((l) => setItems(l.filter((x) => x.kind === "wallet")))
        .catch(() => setItems([]));
    load();
    window.addEventListener(WATCHLIST_CHANGED_EVENT, load);
    return () => window.removeEventListener(WATCHLIST_CHANGED_EVENT, load);
  }, [user?.id]);
  return (
    <Card>
      <CardHeader title="Watched wallets" icon={<Bookmark className="h-4 w-4" />} subtitle="Wallets you watch from an account page" actions={<Link href="/alerts" className="text-2xs font-medium text-accent hover:underline">Wallet alerts →</Link>} />
      <CardBody>
        {items === null ? null : items.length === 0 ? (
          <EmptyState title="No watched wallets yet" description="Open any account page and press Watch to keep it here and use it in wallet alerts." className="py-6" />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {items.map((w) => (
              <li key={w.id} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border-subtle px-3 py-2">
                <span className="truncate text-xs text-fg">{w.label && w.label !== w.value ? w.label : "Wallet"}</span>
                <AccountRef address={w.value} labels={index} />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
