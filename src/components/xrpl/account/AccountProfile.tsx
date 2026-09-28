"use client";

import { Fingerprint, ShieldAlert, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Hash, Stat } from "@/components/ui/Misc";
import { EmptyState } from "@/components/ui/States";
import type { ProfileLabel } from "@/lib/xrpl/profiler";
import type { RiskSignal } from "@/lib/xrpl/risk";
import { decodeAccountFlags } from "@/lib/xrpl/tx";
import type { AccountRootData } from "@/lib/xrpl/types";

export function ProfileCard({ labels, windowText, className }: { labels: ProfileLabel[]; windowText: string; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader
        title="Wallet profile"
        icon={<Fingerprint className="h-4 w-4" />}
        subtitle={`Rule-based · ${windowText}`}
        info="Deterministic rules on public ledger data. Each classification states why it applies. Behaviour labels are descriptive — they are not identity, intent or quality judgements, and 'smart money' is never inferred from balance."
      />
      <CardBody>
        {labels.length === 0 ? (
          <EmptyState title="No behavioural classification" description="None of the profiler rules matched this account's data." className="py-6" />
        ) : (
          <ul className="space-y-2.5">
            {labels.map((l) => (
              <li key={l.id} className="rounded-lg border border-border-subtle p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={l.id === "whale" ? "accent" : l.id === "dormant" ? "neutral" : "info"} className="normal-case tracking-normal">
                    {l.name}
                  </Badge>
                  <span className="text-2xs text-fg-muted">{l.basis === "external-label" ? "from external label" : l.basis === "heuristic" ? "heuristic" : "rule-based"}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-fg-secondary">{l.explanation}</p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function RiskCard({ signals, className }: { signals: RiskSignal[]; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader title="Risk signals" icon={<ShieldAlert className="h-4 w-4" />} subtitle="Informational patterns in the fetched window" />
      <CardBody>
        {signals.length === 0 ? (
          <p className="py-4 text-center text-xs text-fg-muted">No risk signals triggered in the fetched window.</p>
        ) : (
          <ul className="space-y-2">
            {signals.map((s) => (
              <li key={s.id} className="flex gap-2 rounded-lg border border-border-subtle p-2.5">
                <Badge tone={s.level === "notice" ? "warning" : "neutral"}>{s.title}</Badge>
                <p className="text-xs leading-relaxed text-fg-secondary">{s.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <CardFooter>
        <span>Signals describe observable patterns only. They are not accusations, ratings or advice.</span>
      </CardFooter>
    </Card>
  );
}

export function AccountSettingsCard({ data, domain, signerCount, className }: { data: AccountRootData; domain: string | null; signerCount: number | null; className?: string }) {
  const flags = decodeAccountFlags(data.Flags);
  return (
    <Card className={className}>
      <CardHeader title="Account settings" icon={<Settings2 className="h-4 w-4" />} subtitle="AccountRoot on the validated ledger" />
      <CardBody>
        <div className="divide-y divide-border-subtle/60">
          <Stat label="Domain (self-declared)" value={domain ?? "—"} />
          <Stat label="Regular key" value={data.RegularKey ? <Hash value={data.RegularKey} href={`/xrpl/account/${data.RegularKey}`} /> : "none"} />
          <Stat label="Multi-signing" value={signerCount ? `${signerCount} signers` : "not configured"} />
          {data.TransferRate ? <Stat label="Transfer fee" value={`${((data.TransferRate / 1e9 - 1) * 100).toFixed(4)}%`} /> : null}
          {data.TickSize ? <Stat label="Tick size" value={data.TickSize} /> : null}
          {data.AMMID && <Stat label="AMM ID" value={<Hash value={data.AMMID} head={8} tail={6} />} />}
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {flags.length ? (
            flags.map((f) => (
              <Badge key={f} tone="neutral" className="normal-case tracking-normal">
                {f}
              </Badge>
            ))
          ) : (
            <span className="text-2xs text-fg-muted">No account flags set.</span>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
