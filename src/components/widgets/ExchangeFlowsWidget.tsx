"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowDownLeft, ArrowUpRight, Building2 } from "lucide-react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { SkeletonRows } from "@/components/ui/States";
import { formatCompact } from "@/lib/format";
import { useXrplSession } from "@/lib/xrpl/hooks";
import { exchangeFlowTotals, FLOW_DISCLAIMER, WHALE_BUFFER_MIN } from "@/lib/xrpl/whales";
import { SessionBanner, XrplErrorState } from "@/components/xrpl/shared";
import { useLabels } from "@/components/xrpl/useLabels";

/** Dashboard widget: labelled exchange inflow/outflow observed this session (large XRP payments only). */
export function ExchangeFlowsWidget({ className }: { className?: string }) {
  const s = useXrplSession(["ledger", "transactions"]);
  const { index, wellKnown } = useLabels();
  const t = useMemo(() => exchangeFlowTotals(s.whales, index), [s.whales, index]);
  const labelled = t.inflowCount + t.outflowCount;
  return (
    <Card className={className}>
      <CardHeader
        title="Exchange flows"
        icon={<Building2 className="h-4 w-4" />}
        subtitle={`Labelled exchanges · payments ≥ ${formatCompact(WHALE_BUFFER_MIN, 0)} XRP`}
        actions={
          <Link href="/xrpl/whales" className="text-2xs font-medium text-accent hover:underline">
            Open →
          </Link>
        }
      />
      <CardBody className="space-y-3">
        {s.error && !s.txStartedAt ? (
          <XrplErrorState error={new Error(s.error)} server={s.server} onRetry={s.retry} title="Transaction stream unavailable" />
        ) : !s.txStartedAt ? (
          <SkeletonRows rows={3} />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border-subtle p-2">
                <p className="label flex items-center gap-1">
                  <ArrowDownLeft className="h-3 w-3" /> Inflow
                </p>
                <p className="num text-sm font-semibold text-fg">{formatCompact(t.inflowXrp)}</p>
                <p className="text-2xs text-fg-muted">{t.inflowCount} tx</p>
              </div>
              <div className="rounded-lg border border-border-subtle p-2">
                <p className="label flex items-center gap-1">
                  <ArrowUpRight className="h-3 w-3" /> Outflow
                </p>
                <p className="num text-sm font-semibold text-fg">{formatCompact(t.outflowXrp)}</p>
                <p className="text-2xs text-fg-muted">{t.outflowCount} tx</p>
              </div>
              <div className="rounded-lg border border-border-subtle p-2">
                <p className="label">Net</p>
                <p className="num text-sm font-semibold text-fg">{labelled ? `${t.netXrp >= 0 ? "+" : ""}${formatCompact(t.netXrp)}` : "—"}</p>
                <p className="text-2xs text-fg-muted">XRP</p>
              </div>
            </div>
            {!labelled && <p className="text-2xs text-fg-muted">No large transfers involving labelled exchanges observed yet this session.</p>}
            <p className="text-2xs text-fg-muted">{FLOW_DISCLAIMER} Only transfers where a side carries an XRPScan exchange label are counted{wellKnown.available ? "" : " — label source currently unavailable"}.</p>
          </>
        )}
        <SessionBanner startedAt={s.txStartedAt} ledgers={s.txLedgers} gaps={s.gaps} className="py-1.5" />
      </CardBody>
      <CardFooter>
        <span>Source: XRPL transaction stream + XRPScan labels</span>
      </CardFooter>
    </Card>
  );
}
