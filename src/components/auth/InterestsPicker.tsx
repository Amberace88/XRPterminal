"use client";

import { Check } from "lucide-react";
import { INTERESTS, type InterestId } from "@/components/settings/platformSettings";
import { cn } from "@/lib/utils/cn";

/** Multi-select interest chips (onboarding step 2, spec §15). */
export function InterestsPicker({ value, onChange }: { value: InterestId[]; onChange: (v: InterestId[]) => void }) {
  const toggle = (id: InterestId) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Interests">
      {INTERESTS.map((i) => {
        const on = value.includes(i.id);
        return (
          <button
            key={i.id}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => toggle(i.id)}
            className={cn(
              "flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
              on ? "border-accent/50 bg-accent/10 text-fg" : "border-border-subtle bg-bg-secondary/50 text-fg-secondary hover:border-border hover:text-fg",
            )}
          >
            {i.label}
            <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-full border", on ? "border-accent bg-accent text-white" : "border-border")}>
              {on && <Check className="h-3 w-3" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
