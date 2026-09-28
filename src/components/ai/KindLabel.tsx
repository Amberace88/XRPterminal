import { ClaimLabel } from "@/components/ui/Misc";
import type { BriefItemKind } from "@/lib/intel/types";

/** FACT / ANALYSIS / SCENARIO label, plus a neutral "N/A" tag for unavailable inputs. */
export function KindLabel({ kind }: { kind: BriefItemKind }) {
  if (kind === "UNAVAILABLE")
    return <span className="rounded border border-border px-1 py-px text-[10px] font-bold tracking-wider text-fg-muted">N/A</span>;
  return <ClaimLabel kind={kind} />;
}
