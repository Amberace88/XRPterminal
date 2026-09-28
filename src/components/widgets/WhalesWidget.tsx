"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Fish } from "lucide-react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { useMarket } from "@/components/providers/MarketProvider";
import { formatTime } from "@/lib/format";
import { useXrplSession } from "@/lib/xrpl/hooks";
import { DEFAULT_WHALE_THRESHOLD, filterWhales } from "@/lib/xrpl/whales";
import { XrplConnection, XrplErrorState } from "@/components/xrpl/shared";
import { useLabels } from "@/components/xrpl/useLabels";
import { WhaleDisclaimer, WhaleRow } from "@/components/xrpl/WhalesView";

/** Dashboard widget: XRP payments ≥ 1M XRP observed since this session connected. */
export function WhalesWidget({ className }: { className?: string }) {
  const s = useXrplSession(["ledger", "transactions"]);
  const { index } = useLabels();
  const { ticker } = useMarket();
  const list = useMemo(() => filterWhales(s.whales, DEFAULT_WHALE_THRESHOLD), [s.whales]);
  return (
    <Card className={className}>
      <CardHeader
        title="Whale transfers"
        icon={<Fish className="h-4 w-4" />}
        subtitle="≥ 1M XRP delivered · since connected"
        actions={
          <Link href="/xrpl/whales" className="text-2xs font-medium text-accent hover:underline">
            Open →
          </Link>
        }
      />
      <CardBody className="space-y-2 px-0 sm:px-0">
        <div className="px-4 sm:px-5">
          <WhaleDisclaimer compact />
        </div>
        {s.error && !s.txStartedAt ? (
          <XrplErrorState error={new Error(s.error)} server={s.server} onRetry={s.retry} title="Transaction stream unavailable" />
        ) : list.length === 0 ? (
          <EmptyState
            className="py-5"
            title={s.txStartedAt ? "None observed yet" : "Connecting…"}
            description={s.txStartedAt ? `Listening since ${formatTime(s.txStartedAt, undefined, false)} — ${s.txLedgers} ledgers observed. No backfilled history.` : undefined}
          />
        ) : (
          <ul className="max-h-[220px] overflow-y-auto">
            {list.slice(0, 5).map((w) => (
              <WhaleRow key={w.hash} w={w} labels={index} price={ticker?.price ?? null} dense />
            ))}
          </ul>
        )}
      </CardBody>
      <CardFooter>
        <XrplConnection state={s.connState} server={s.server} />
        <span>{list.length} this session</span>
      </CardFooter>
    </Card>
  );
}
