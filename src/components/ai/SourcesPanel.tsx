"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/format";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import type { SourceRef } from "@/lib/intel/types";

/** "View sources" disclosure (spec §223): source, timestamp, provider and original link where allowed. */
export function SourcesPanel({ sources, className, defaultOpen = false, label = "View sources" }: { sources: SourceRef[]; className?: string; defaultOpen?: boolean; label?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const { tz } = usePreferences();
  const uniq = sources.filter((s, i, a) => a.findIndex((x) => x.label === s.label && x.url === s.url) === i);
  if (!uniq.length) return null;
  return (
    <div className={cn("text-2xs", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded text-fg-muted transition-colors hover:text-fg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        {label} ({uniq.length})
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 border-l border-border-subtle pl-3 animate-fade-up">
          {uniq.map((s, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-fg-muted">
              {s.url ? (
                s.url.startsWith("/") ? (
                  <Link href={s.url} className="text-accent-strong hover:underline">
                    {s.label}
                  </Link>
                ) : (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-strong hover:underline">
                    {s.label}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )
              ) : (
                <span className="text-fg-secondary">{s.label}</span>
              )}
              {s.provider && <span>· {s.provider}</span>}
              {s.timestamp ? <span>· {formatDateTime(s.timestamp, tz)}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
