"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Code2, FileJson, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CopyButton, Hash, Stat } from "@/components/ui/Misc";
import { EmptyState, Skeleton, SkeletonRows } from "@/components/ui/States";
import { InfoTip } from "@/components/ui/Tooltip";
import { useMarket } from "@/components/providers/MarketProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { cn } from "@/lib/utils/cn";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { deliveredAmount, feeXrp, isPartialPayment, parseAmount, statedAmount } from "@/lib/xrpl/amount";
import { isTxHash } from "@/lib/xrpl/address";
import { useXrplQuery } from "@/lib/xrpl/hooks";
import { extractBalanceChanges, summarizeAffectedNodes, type BalanceChange } from "@/lib/xrpl/meta";
import { ASF_FLAGS, decodeMemos, decodeTxFlags, explainResult, normalizeTxEnvelope, TX_TYPE_DESCRIPTION } from "@/lib/xrpl/tx";
import type { Json } from "@/lib/xrpl/types";
import { AccountRef, AmountText, ResultBadge, XrplErrorState } from "./shared";
import { ShareButton } from "./ShareButton";
import { useLabels } from "./useLabels";

export function TxDetail({ hash }: { hash: string }) {
  const valid = isTxHash(hash);
  const h = hash.toUpperCase();
  const q = useXrplQuery<Json>(valid ? `tx:${h}` : null, (c) => c.request<Json>("tx", { transaction: h, binary: false }, 20_000));
  const env = useMemo(() => (q.data ? normalizeTxEnvelope(q.data) : null), [q.data]);
  const { index: labels } = useLabels();

  if (!valid) return <EmptyState title="Not a valid transaction hash" description="A transaction hash is 64 hexadecimal characters." />;
  if (q.error) {
    const notFound = q.error.code === "txnNotFound";
    return (
      <Card>
        {notFound ? (
          <EmptyState
            title="Transaction not found"
            description={`The connected server does not have this transaction. It may not exist, may not be validated yet, or the server may not keep that part of history. Server: ${q.server ?? "unknown"}.`}
            action={
              <Button variant="secondary" size="sm" onClick={q.reload}>
                Try again
              </Button>
            }
          />
        ) : (
          <XrplErrorState error={q.error} server={q.server} onRetry={q.reload} />
        )}
      </Card>
    );
  }
  if (!env)
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-28 w-full" />
        <SkeletonRows rows={8} />
      </div>
    );
  return <TxBody env={env} raw={q.data!} labels={labels} server={q.server} />;
}

function Section({ title, info, children, className, id }: { title: string; info?: string; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <Card className={className} id={id}>
      <CardHeader title={title} info={info} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function TxBody({ env, raw, labels, server }: { env: NonNullable<ReturnType<typeof normalizeTxEnvelope>>; raw: Json; labels: ReturnType<typeof useLabels>["index"]; server: string | null }) {
  const { tz } = usePreferences();
  const { ticker, toDisplay, currency } = useMarket();
  const [showRaw, setShowRaw] = useState(false);
  const tx = env.tx;
  const result = env.meta?.TransactionResult ?? "unknown";
  const r = explainResult(result);
  const d = deliveredAmount(tx, env.meta);
  const stated = statedAmount(tx);
  const partial = isPartialPayment(tx);
  const fee = feeXrp(tx);
  const flags = decodeTxFlags(tx.TransactionType, tx.Flags);
  const memos = decodeMemos(tx);
  const affected = summarizeAffectedNodes(env.meta);
  const changes = extractBalanceChanges(env.meta);
  const byAccount = changes.reduce<Record<string, BalanceChange[]>>((m, c) => ((m[c.account] = [...(m[c.account] ?? []), c]), m), {});
  const deliveredValue = d.amount?.kind === "XRP" && ticker ? toDisplay(d.amount.num * ticker.price) : null;

  return (
    <div className="space-y-4">
      {/* 1. Status */}
      <Card className={cn("overflow-hidden", r.cls === "success" ? "border-success/30" : r.cls === "failed-fee-claimed" ? "border-danger/30" : "border-warning/30")}>
        <CardBody className="pt-4 sm:pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <ResultBadge code={result} className="px-2 py-1 text-xs" />
            <Badge tone={env.validated ? "success" : "warning"}>{env.validated ? "Validated" : "Not validated"}</Badge>
            <Badge tone="neutral" className="normal-case tracking-normal">
              {tx.TransactionType}
            </Badge>
            <div className="ml-auto">
              <ShareButton title={`XRPL transaction ${env.hash.slice(0, 10)}…`} />
            </div>
          </div>
          <p className="mt-2 text-sm font-medium text-fg">{r.title}</p>
          <p className="mt-0.5 text-xs text-fg-secondary">{r.explanation}</p>
          <div className="mt-3 flex min-w-0 items-center gap-1 font-mono text-2xs text-fg-muted">
            <span className="truncate">{env.hash}</span>
            <CopyButton value={env.hash} label="Copy hash" />
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* 2. Summary */}
        <Section title="Summary" className="lg:col-span-7" info={TX_TYPE_DESCRIPTION[tx.TransactionType]}>
          <div className="divide-y divide-border-subtle/60">
            <Stat label="Type" value={tx.TransactionType} />
            <Stat label="From" value={<AccountRef address={tx.Account} labels={labels} />} />
            {tx.Destination && <Stat label="To" value={<AccountRef address={tx.Destination} labels={labels} />} />}
            {(tx.TransactionType === "Payment" || d.amount) && (
              <Stat
                label={
                  <span className="inline-flex items-center gap-1">
                    Delivered amount <InfoTip text={`Source: ${d.source}. The delivered amount comes from transaction metadata — for partial payments the stated Amount is only a maximum.`} />
                  </span>
                }
                value={
                  <span className="flex flex-col items-end">
                    <AmountText amount={d.amount} className="text-base font-semibold" />
                    {deliveredValue !== null && <span className="text-2xs text-fg-muted">≈ {formatMoney(deliveredValue, currency)} at current price</span>}
                  </span>
                }
              />
            )}
            {tx.TransactionType === "Payment" && stated && (d.amount?.value !== stated.value || partial) && (
              <Stat label="Stated Amount (maximum)" value={<AmountText amount={stated} className="text-fg-muted" />} />
            )}
            {tx.TakerGets !== undefined && <Stat label="Taker gets (offered)" value={<AmountText amount={parseAmount(tx.TakerGets)} />} />}
            {tx.TakerPays !== undefined && <Stat label="Taker pays (wanted)" value={<AmountText amount={parseAmount(tx.TakerPays)} />} />}
            {tx.LimitAmount && <Stat label="Trust line limit" value={<AmountText amount={parseAmount(tx.LimitAmount)} />} />}
            {tx.SendMax !== undefined && <Stat label="SendMax" value={<AmountText amount={parseAmount(tx.SendMax)} />} />}
            <Stat label="Fee" value={`${formatNumber(fee, 6)} XRP (${tx.Fee ?? "—"} drops)`} />
            <Stat
              label="Ledger"
              value={
                env.ledgerIndex ? (
                  <Link className="text-accent-strong hover:underline" href={`/xrpl/ledger/${env.ledgerIndex}`}>
                    #{env.ledgerIndex.toLocaleString("en-US")}
                  </Link>
                ) : (
                  "—"
                )
              }
            />
            <Stat
              label="Time"
              value={
                <span className="flex flex-col items-end">
                  <span>{formatDateTime(env.closeTimeMs, "UTC")}</span>
                  <span className="text-2xs text-fg-muted">{formatDateTime(env.closeTimeMs, tz)} (your time zone)</span>
                </span>
              }
            />
          </div>
          {partial && (
            <p className="mt-3 flex gap-2 rounded-lg border border-warning/30 bg-warning/[0.06] px-3 py-2 text-2xs text-warning">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Partial payment: the stated Amount is a maximum. Only the delivered amount above actually arrived.
            </p>
          )}
        </Section>

        {/* 3. Technical */}
        <Section title="Technical details" className="lg:col-span-5">
          <div className="divide-y divide-border-subtle/60">
            {tx.Sequence !== undefined && <Stat label="Sequence" value={tx.Sequence === 0 && tx.TicketSequence ? `0 (ticket ${tx.TicketSequence})` : tx.Sequence} />}
            {tx.DestinationTag !== undefined && <Stat label="Destination tag" value={tx.DestinationTag} />}
            {tx.SourceTag !== undefined && <Stat label="Source tag" value={tx.SourceTag} />}
            {tx.OfferSequence !== undefined && <Stat label="Offer sequence" value={tx.OfferSequence} />}
            {tx.SetFlag !== undefined && <Stat label="SetFlag" value={ASF_FLAGS[tx.SetFlag] ?? tx.SetFlag} />}
            {tx.ClearFlag !== undefined && <Stat label="ClearFlag" value={ASF_FLAGS[tx.ClearFlag] ?? tx.ClearFlag} />}
            <Stat
              label="Flags"
              value={
                flags.names.length || flags.unknown ? (
                  <span className="flex flex-wrap justify-end gap-1">
                    {flags.names.map((n) => (
                      <Badge key={n} tone="neutral" className="normal-case tracking-normal">
                        {n}
                      </Badge>
                    ))}
                    {flags.unknown && <Badge tone="warning">{flags.unknown}</Badge>}
                  </span>
                ) : (
                  "none"
                )
              }
            />
            {typeof tx.LastLedgerSequence === "number" && <Stat label="LastLedgerSequence" value={tx.LastLedgerSequence} />}
            {env.meta?.TransactionIndex !== undefined && <Stat label="Index in ledger" value={env.meta.TransactionIndex} />}
            {Array.isArray(tx.Signers) && <Stat label="Multi-signed by" value={`${(tx.Signers as unknown[]).length} signers`} />}
            {typeof tx.NetworkID === "number" && <Stat label="Network ID" value={tx.NetworkID} />}
          </div>
          {memos.length > 0 && (
            <div className="mt-4">
              <p className="label mb-2">Memos ({memos.length})</p>
              <ul className="space-y-2">
                {memos.map((m, i) => (
                  <li key={i} className="rounded-lg border border-border-subtle bg-surface-hover/40 p-2 text-xs">
                    {m.type && <p className="text-2xs text-fg-muted">Type: {m.type}</p>}
                    {m.data !== null ? (
                      <p className="whitespace-pre-wrap break-words text-fg">{m.data}</p>
                    ) : m.dataHex ? (
                      <p className="break-all font-mono text-2xs text-fg-muted">Binary data (hex): {m.dataHex.slice(0, 200)}{m.dataHex.length > 200 ? "…" : ""}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-2xs text-fg-muted">Memos are public text chosen by the sender. They are shown as-is and are not verified.</p>
            </div>
          )}
        </Section>
      </div>

      {/* 4. Affected objects */}
      <Section title={`Affected ledger objects (${affected.length})`} info="Every ledger entry this transaction created, modified or deleted, from transaction metadata (AffectedNodes).">
        {Object.keys(byAccount).length > 0 && (
          <div className="mb-4">
            <p className="label mb-2">Balance changes by account</p>
            <ul className="divide-y divide-border-subtle/60 rounded-lg border border-border-subtle">
              {Object.entries(byAccount).map(([acct, list]) => (
                <li key={acct} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <AccountRef address={acct} labels={labels} />
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 sm:justify-end">
                    {list.map((c, i) => (
                      <span key={i} className={cn("num text-xs", Number(c.value) >= 0 ? "text-success" : "text-danger")}>
                        {Number(c.value) >= 0 ? "+" : ""}
                        {Number(c.value).toLocaleString("en-US", { maximumFractionDigits: 6 })} {c.currency}
                        {c.issuer && <span className="ml-1 text-2xs text-fg-muted">({c.issuer.slice(0, 5)}…)</span>}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-2xs text-fg-muted">XRP changes include the transaction fee paid by the sender.</p>
          </div>
        )}
        {affected.length === 0 ? (
          <p className="text-xs text-fg-muted">No metadata available.</p>
        ) : (
          <ul className="space-y-2">
            {affected.map((a) => (
              <li key={a.ledgerIndex + a.kind} className="rounded-lg border border-border-subtle p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={a.kind === "CreatedNode" ? "success" : a.kind === "DeletedNode" ? "danger" : "info"}>{a.kind.replace("Node", "")}</Badge>
                  <span className="text-xs font-medium text-fg">{a.title}</span>
                  <span className="text-2xs text-fg-muted">{a.entryType}</span>
                  {a.account && <AccountRef address={a.account} labels={labels} className="ml-auto" />}
                </div>
                {a.changes.length > 0 && (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-2xs">
                      <tbody>
                        {a.changes.map((c, i) => (
                          <tr key={i} className="border-t border-border-subtle/50">
                            <td className="py-1 pr-3 text-fg-muted">{c.field}</td>
                            <td className="num py-1 pr-2 text-right text-fg-secondary">{c.before ?? "—"}</td>
                            <td className="px-1 py-1 text-fg-muted">
                              <ArrowRight className="h-3 w-3" />
                            </td>
                            <td className="num py-1 pr-2 text-fg">{c.after ?? "—"}</td>
                            {c.delta !== undefined && (
                              <td className={cn("num py-1 text-right", Number(c.delta) >= 0 ? "text-success" : "text-danger")}>
                                {Number(c.delta) >= 0 ? "+" : ""}
                                {c.delta}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-1">
                  <Hash value={a.ledgerIndex} head={10} tail={6} className="text-2xs" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 5. Raw */}
      <Card>
        <CardHeader
          title="Raw JSON"
          icon={<FileJson className="h-4 w-4" />}
          subtitle={`As returned by ${server ?? "the XRPL server"}`}
          actions={
            <Button variant="ghost" size="xs" onClick={() => setShowRaw((v) => !v)} aria-expanded={showRaw}>
              <Code2 className="h-3.5 w-3.5" /> {showRaw ? "Hide" : "Show"}
            </Button>
          }
        />
        {showRaw && (
          <CardBody>
            <div className="relative">
              <CopyButton value={JSON.stringify(raw, null, 2)} className="absolute right-2 top-2" label="Copy JSON" />
              <pre className="max-h-[480px] overflow-auto rounded-lg border border-border-subtle bg-bg-secondary p-3 font-mono text-[11px] leading-relaxed text-fg-secondary">{JSON.stringify(raw, null, 2)}</pre>
            </div>
          </CardBody>
        )}
      </Card>
    </div>
  );
}
