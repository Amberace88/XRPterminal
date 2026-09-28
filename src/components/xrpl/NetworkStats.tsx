"use client";

import { Server } from "lucide-react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Misc";
import { SkeletonRows } from "@/components/ui/States";
import { DataFreshness } from "@/components/ui/DataFreshness";
import { formatDuration, formatNumber } from "@/lib/format";
import { serverName, useServerInfo } from "@/lib/xrpl/hooks";
import { XrplErrorState } from "./shared";

/** Network stats as reported by the connected server's `server_info`. */
export function NetworkStats({ className }: { className?: string }) {
  const q = useServerInfo(30_000);
  const i = q.data?.info;
  const v = i?.validated_ledger;
  const ranges = i?.complete_ledgers?.split(",") ?? [];
  const historyFrom = ranges.length ? ranges[0].split("-")[0] : null;
  return (
    <Card className={className}>
      <CardHeader title="Network status" icon={<Server className="h-4 w-4" />} subtitle={`server_info · ${serverName(q.server)}`} info="Values are reported by the XRPL server this browser is connected to. Different servers can have different history ranges and load." />
      <CardBody>
        {q.error && !i ? (
          <XrplErrorState error={q.error} server={q.server} onRetry={q.reload} />
        ) : !i ? (
          <SkeletonRows rows={8} />
        ) : (
          <div className="divide-y divide-border-subtle/60">
            <Stat label="Validated ledger" value={v?.seq ? `#${v.seq.toLocaleString("en-US")}` : "—"} />
            <Stat label="Ledger age" value={v?.age !== undefined ? `${v.age}s` : "—"} />
            <Stat label="Base fee" value={v?.base_fee_xrp !== undefined ? `${formatNumber(v.base_fee_xrp, 6)} XRP` : "—"} />
            <Stat label="Base reserve" value={v?.reserve_base_xrp !== undefined ? `${formatNumber(v.reserve_base_xrp, 6)} XRP` : "—"} />
            <Stat label="Owner reserve (per object)" value={v?.reserve_inc_xrp !== undefined ? `${formatNumber(v.reserve_inc_xrp, 6)} XRP` : "—"} />
            <Stat label="Server state" value={i.server_state ?? "—"} />
            <Stat label="Load factor" value={i.load_factor !== undefined ? formatNumber(i.load_factor, 2) : "—"} />
            <Stat label="Peers" value={i.peers ?? "—"} />
            <Stat label="Validation quorum" value={i.validation_quorum ?? "—"} />
            <Stat label="History from ledger" value={historyFrom ? `#${Number(historyFrom).toLocaleString("en-US")}${ranges.length > 1 ? ` (${ranges.length} ranges)` : ""}` : "—"} />
            <Stat label="rippled version" value={i.build_version ?? "—"} />
            <Stat label="Server uptime" value={i.uptime !== undefined ? formatDuration(i.uptime * 1000) : "—"} />
          </div>
        )}
      </CardBody>
      <CardFooter>
        <DataFreshness timestamp={q.updatedAt} kind="minute" />
        <span>Refreshes every 30s</span>
      </CardFooter>
    </Card>
  );
}
