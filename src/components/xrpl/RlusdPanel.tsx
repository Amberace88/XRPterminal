"use client";

import { BadgeDollarSign, CircleCheck, ExternalLink, TriangleAlert } from "lucide-react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Misc";
import { SkeletonRows } from "@/components/ui/States";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { Button } from "@/components/ui/Button";
import { formatNumber } from "@/lib/format";
import { useXrplQuery } from "@/lib/xrpl/hooks";
import { RLUSD_CURRENCY_HEX, RLUSD_DISCLAIMER, RLUSD_EXPECTED_DOMAIN, RLUSD_ISSUER, RLUSD_SOURCE_URL } from "@/lib/xrpl/rlusd";
import { decodeDomain } from "@/lib/xrpl/tx";
import type { AccountInfoResult, GatewayBalancesResult } from "@/lib/xrpl/types";
import { AccountRef } from "./shared";

/** Educational RLUSD panel: issuer verification, on-ledger obligations, session activity. */
export function RlusdPanel({ sessionPayments, sessionVolume, sessionActive, className }: { sessionPayments: number; sessionVolume: number; sessionActive: boolean; className?: string }) {
  const issuer = useXrplQuery<AccountInfoResult>("rlusd:issuer", (c) => c.request<AccountInfoResult>("account_info", { account: RLUSD_ISSUER, ledger_index: "validated" }));
  const gb = useXrplQuery<GatewayBalancesResult>("rlusd:gateway_balances", (c) => c.request<GatewayBalancesResult>("gateway_balances", { account: RLUSD_ISSUER, ledger_index: "validated", strict: true }, 30_000), {
    refreshMs: 10 * 60_000,
  });
  const domain = decodeDomain(issuer.data?.account_data.Domain);
  const domainOk = domain?.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "") === RLUSD_EXPECTED_DOMAIN;
  const obligation = gb.data?.obligations?.[RLUSD_CURRENCY_HEX] ?? gb.data?.obligations?.RLUSD;

  return (
    <Card className={className} id="rlusd">
      <CardHeader
        title="RLUSD on the XRP Ledger"
        icon={<BadgeDollarSign className="h-4 w-4" />}
        subtitle="Ripple USD stablecoin — on-ledger data, educational"
        actions={
          <a href={RLUSD_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-2xs text-accent hover:underline">
            Issuer source <ExternalLink className="h-3 w-3" />
          </a>
        }
      />
      <CardBody className="space-y-4">
        <p className="text-xs leading-relaxed text-fg-secondary">
          Ripple USD (RLUSD) is a USD-denominated stablecoin issued by Ripple on the XRP Ledger and Ethereum. On the XRP Ledger it is an issued token: holders keep a trust line to the issuer account below, and the issuer&apos;s
          outstanding obligations equal the RLUSD held by everyone else.
        </p>
        <div className="divide-y divide-border-subtle/60">
          <Stat label="Issuer (published by Ripple)" value={<AccountRef address={RLUSD_ISSUER} />} />
          <Stat label="Currency code" value={<span className="font-mono text-2xs">{RLUSD_CURRENCY_HEX.slice(0, 12)}… (&quot;RLUSD&quot;)</span>} />
          <Stat
            label="On-ledger Domain check"
            value={
              issuer.loading && !issuer.data ? (
                "checking…"
              ) : issuer.error ? (
                <span className="text-warning">unavailable</span>
              ) : domainOk ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <CircleCheck className="h-3.5 w-3.5" /> {domain}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-warning">
                  <TriangleAlert className="h-3.5 w-3.5" /> {domain ?? "no Domain set"} (expected {RLUSD_EXPECTED_DOMAIN})
                </span>
              )
            }
          />
          <Stat
            label="RLUSD issued on XRPL (obligations)"
            value={
              gb.loading && !gb.data ? (
                <SkeletonRows rows={1} className="w-24" />
              ) : gb.error ? (
                <Button variant="ghost" size="xs" onClick={gb.reload}>
                  Unavailable — retry
                </Button>
              ) : obligation ? (
                `${formatNumber(Number(obligation), 0)} RLUSD`
              ) : (
                "—"
              )
            }
          />
          <Stat label="RLUSD payments this session" value={sessionActive ? `${sessionPayments} · ${formatNumber(sessionVolume, 0)} RLUSD delivered` : "—"} />
        </div>
        <p className="text-2xs text-fg-muted">
          The Domain field is self-declared by the account; it is shown as a consistency check alongside Ripple&apos;s published issuer address. Obligations come from{" "}
          <span className="font-mono">gateway_balances</span> on the validated ledger and cover the XRP Ledger only (not Ethereum supply).
        </p>
        <p className="flex gap-2 rounded-lg border border-info/30 bg-info/[0.06] px-3 py-2 text-2xs text-fg-secondary">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
          {RLUSD_DISCLAIMER}
        </p>
      </CardBody>
      <CardFooter>
        <DataFreshness timestamp={gb.updatedAt} kind="minute" />
        <span>Source: XRPL {gb.server ?? issuer.server ?? ""}</span>
      </CardFooter>
    </Card>
  );
}
