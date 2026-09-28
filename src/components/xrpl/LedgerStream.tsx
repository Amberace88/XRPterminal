"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { SkeletonRows } from "@/components/ui/States";
import { formatDuration, formatNumber, formatTime } from "@/lib/format";
import { useXrplSession } from "@/lib/xrpl/hooks";
import { dropsToXrpString } from "@/lib/xrpl/amount";
import { XrplConnection, XrplErrorState } from "./shared";

const xrp = (drops: number | null) => (drops === null ? "—" : `${Number(dropsToXrpString(drops))} XRP`);

/** Live validated-ledger stream (ledger stream only; light enough for any page). */
export function LedgerStreamPanel({ className, rows = 12 }: { className?: string; rows?: number }) {
  const s = useXrplSession(["ledger"]);
  const list = s.ledgers.slice(0, rows);
  const latest = s.ledgers[0];
  return (
    <section className={className} aria-labelledby="ledger-stream-title">
      <Card className="h-full">
        <CardHeader
          title={<span id="ledger-stream-title">Latest validated ledgers</span>}
          icon={<Layers className="h-4 w-4" />}
          subtitle="Live from the XRPL ledger stream"
          actions={<XrplConnection state={s.connState} server={s.server} />}
        />
        <CardBody className="px-0 sm:px-0">
          {s.error && !list.length ? (
            <XrplErrorState error={new Error(s.error)} server={s.server} onRetry={s.retry} title="Ledger stream unavailable" />
          ) : !list.length ? (
            <SkeletonRows rows={6} className="px-4 sm:px-5" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th scope="col" className="label px-4 py-2 text-left font-medium sm:px-5">Ledger</th>
                    <th scope="col" className="label px-3 py-2 text-left font-medium">Closed</th>
                    <th scope="col" className="label px-3 py-2 text-right font-medium">Txs</th>
                    <th scope="col" className="label hidden px-3 py-2 text-right font-medium sm:table-cell">Interval</th>
                    <th scope="col" className="label hidden px-3 py-2 text-right font-medium md:table-cell">Base fee</th>
                    <th scope="col" className="label hidden px-4 py-2 text-right font-medium md:table-cell sm:px-5">Reserve (base / inc)</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((l, i) => {
                    const prev = list[i + 1];
                    const interval = prev && l.closeTimeMs && prev.closeTimeMs && prev.ledgerIndex === l.ledgerIndex - 1 ? l.closeTimeMs - prev.closeTimeMs : null;
                    return (
                      <tr key={l.ledgerIndex} className={i === 0 ? "animate-fade-up border-b border-border-subtle/60" : "border-b border-border-subtle/60 last:border-0"}>
                        <td className="px-4 py-2 sm:px-5">
                          <Link href={`/xrpl/ledger/${l.ledgerIndex}`} className="num font-medium text-accent-strong hover:underline">
                            {l.ledgerIndex.toLocaleString("en-US")}
                          </Link>
                        </td>
                        <td className="num px-3 py-2 text-fg-secondary">{formatTime(l.closeTimeMs)}</td>
                        <td className="num px-3 py-2 text-right text-fg">{l.txnCount ?? "—"}</td>
                        <td className="num hidden px-3 py-2 text-right text-fg-muted sm:table-cell">{interval !== null ? `${(interval / 1000).toFixed(0)}s` : "—"}</td>
                        <td className="num hidden px-3 py-2 text-right text-fg-muted md:table-cell">{l.feeBaseDrops !== null ? `${l.feeBaseDrops} drops` : "—"}</td>
                        <td className="num hidden px-4 py-2 text-right text-fg-muted md:table-cell sm:px-5">
                          {xrp(l.reserveBaseDrops)} / {xrp(l.reserveIncDrops)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
        <CardFooter>
          <span>
            {s.startedAt ? (
              <>
                Listening {formatDuration(Date.now() - s.startedAt)} · {formatNumber(s.ledgersObserved, 0)} ledgers observed
              </>
            ) : (
              "Waiting for stream"
            )}
          </span>
          <span className="num">{latest ? `#${latest.ledgerIndex.toLocaleString("en-US")}` : ""}</span>
        </CardFooter>
      </Card>
    </section>
  );
}
