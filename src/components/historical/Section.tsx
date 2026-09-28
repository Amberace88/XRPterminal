"use client";

import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { SourceLine } from "@/components/ui/DataFreshness";
import { Methodology } from "@/components/market/parts";
import type { Provenance } from "@/lib/types/market";
import { cn } from "@/lib/utils/cn";

/** A historical-intelligence section: anchored card + optional methodology + provenance footer. */
export function Section({
  id,
  title,
  subtitle,
  info,
  actions,
  methodology,
  provenance,
  footer,
  className,
  children,
  icon,
}: {
  id: string;
  title: string;
  subtitle?: React.ReactNode;
  info?: string;
  actions?: React.ReactNode;
  methodology?: React.ReactNode;
  provenance?: Provenance | null;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-24 min-w-0", className)}>
      <Card className="h-full">
        <CardHeader title={<span id={`${id}-title`}>{title}</span>} subtitle={subtitle} info={info} actions={actions} icon={icon} />
        <CardBody className="space-y-4">
          {children}
          {methodology && <Methodology>{methodology}</Methodology>}
        </CardBody>
        <CardFooter className="flex-wrap">
          <SourceLine provenance={provenance} />
          {footer}
        </CardFooter>
      </Card>
    </section>
  );
}

/** Compact labelled figure for section stat grids. */
export function Fig({ label, value, sub, tone, info }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; tone?: "up" | "down" | "neutral"; info?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border-subtle bg-bg-secondary/40 px-3 py-2.5">
      <div className="label flex items-center gap-1">
        {label}
        {info}
      </div>
      <div className={cn("num mt-0.5 truncate text-lg font-semibold", tone === "up" ? "text-success" : tone === "down" ? "text-danger" : "text-fg")}>{value}</div>
      {sub && <div className="mt-0.5 text-2xs leading-snug text-fg-muted">{sub}</div>}
    </div>
  );
}

export function SampleWarning({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-warning/25 bg-warning/[0.06] px-2.5 py-1.5 text-2xs text-warning">{children}</p>;
}

export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-2xs leading-relaxed text-fg-muted", className)}>{children}</p>;
}
