"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import { Sparkline } from "@/components/charts/Sparkline";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { SkeletonRows } from "@/components/ui/States";
import { formatNumber, formatTime } from "@/lib/format";
import { useXrplSession } from "@/lib/xrpl/hooks";
import { XrplConnection, XrplErrorState } from "@/components/xrpl/shared";

/** Dashboard widget: live validated ledgers and network transaction rate (ledger stream). */
export function XrplActivityWidget({ className }: { className?: string }) {
  const s = useXrplSession(["ledger"]);
  const ls = s.ledgers.filter((l) => l.txnCount !== null && l.closeTimeMs !== null);
  const latest = s.ledgers[0];
  const span = ls.length >= 2 ? (ls[0].closeTimeMs! - ls[ls.length - 1].closeTimeMs!) / 1000 : 0;
  // tx closed in ledgers after the oldest one, over the elapsed time
  const txs = ls.slice(0, -1).reduce((a, l) => a + (l.txnCount ?? 0), 0);
  const rate = span > 0 ? txs / span : null;
  const avg = ls.length ? ls.reduce((a, l) => a + (l.txnCount ?? 0), 0) / ls.length : null;
  const spark = [...ls].reverse().map((l) => l.txnCount ?? 0);
  return (
    <Card className={className}>
      <CardHeader
        title="XRPL activity"
        icon={<Activity className="h-4 w-4" />}
        subtitle="Live validated ledgers"
        actions={
          <Link href="/xrpl/activity" className="text-2xs font-medium text-accent hover:underline">
            Open →
          </Link>
        }
      />
      <CardBody>
        {s.error && !latest ? (
          <XrplErrorState error={new Error(s.error)} server={s.server} onRetry={s.retry} title="Ledger stream unavailable" />
        ) : !latest ? (
          <SkeletonRows rows={4} />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="label">Ledger</p>
                <Link href={`/xrpl/ledger/${latest.ledgerIndex}`} className="num text-sm font-semibold text-fg hover:text-accent">
                  #{latest.ledgerIndex.toLocaleString("en-US")}
                </Link>
                <p className="num text-2xs text-fg-muted">{formatTime(latest.closeTimeMs)}</p>
              </div>
              <div>
                <p className="label">Tx / sec</p>
                <p className="num text-sm font-semibold text-fg">{rate !== null ? rate.toFixed(1) : "—"}</p>
                <p className="text-2xs text-fg-muted">observed</p>
              </div>
              <div>
                <p className="label">Tx / ledger</p>
                <p className="num text-sm font-semibold text-fg">{avg !== null ? formatNumber(avg, 0) : "—"}</p>
                <p className="text-2xs text-fg-muted">{ls.length} ledgers</p>
              </div>
            </div>
            <div className="mt-4">
              {spark.length >= 2 ? <Sparkline values={spark} width={320} height={56} tone="accent" className="w-full" /> : <p className="py-4 text-center text-2xs text-fg-muted">Collecting ledgers…</p>}
            </div>
          </>
        )}
      </CardBody>
      <CardFooter>
        <XrplConnection state={s.connState} server={s.server} />
        <span>{s.ledgersObserved} observed this session</span>
      </CardFooter>
    </Card>
  );
}
