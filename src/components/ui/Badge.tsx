import { BadgeCheck, CircleDashed, ExternalLink, FlaskConical, ShieldCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-hover text-fg-secondary border-border",
  accent: "bg-accent/10 text-accent-strong border-accent/25",
  success: "bg-success/10 text-success border-success/25",
  warning: "bg-warning/10 text-warning border-warning/25",
  danger: "bg-danger/10 text-danger border-danger/25",
  info: "bg-info/10 text-info border-info/25",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Data-trust badges (spec §221) — visually distinct by design. */
export type TrustKind = "VERIFIED" | "SOURCE VERIFIED" | "SIMULATED" | "EXTERNAL" | "UNVERIFIED" | "BETA" | "MODEL";
export function TrustBadge({ kind, className }: { kind: TrustKind; className?: string }) {
  switch (kind) {
    case "VERIFIED":
      return (
        <Badge tone="success" className={className}>
          <BadgeCheck className="h-3 w-3" /> Verified
        </Badge>
      );
    case "SOURCE VERIFIED":
      return (
        <Badge tone="info" className={className}>
          <ShieldCheck className="h-3 w-3" /> Source verified
        </Badge>
      );
    case "SIMULATED":
      return (
        <Badge tone="warning" className={cn("border-dashed", className)}>
          <FlaskConical className="h-3 w-3" /> Simulated
        </Badge>
      );
    case "EXTERNAL":
      return (
        <Badge tone="neutral" className={className}>
          <ExternalLink className="h-3 w-3" /> External view
        </Badge>
      );
    case "UNVERIFIED":
      return (
        <Badge tone="danger" className={className}>
          <TriangleAlert className="h-3 w-3" /> Unverified
        </Badge>
      );
    case "BETA":
      return (
        <Badge tone="accent" className={className}>
          Beta
        </Badge>
      );
    case "MODEL":
      return (
        <Badge tone="info" className={cn("border-dashed", className)}>
          <CircleDashed className="h-3 w-3" /> Model output
        </Badge>
      );
  }
}
