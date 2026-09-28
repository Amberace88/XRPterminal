"use client";

import { useId, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { m } from "./motion";

/** Accessible accordion (button + region, aria-expanded/controls). One open item at a time. */
export function FaqAccordion({ items, className }: { items: { q: string; a: string }[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return (
    <div className={cn("divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-surface/60", className)}>
      {items.map((it, i) => {
        const isOpen = open === i;
        const btn = `${base}-q${i}`;
        const panel = `${base}-a${i}`;
        return (
          <div key={it.q}>
            <h3>
              <button
                id={btn}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panel}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-fg transition-colors hover:bg-surface-hover/50 sm:px-6 sm:text-base"
              >
                {it.q}
                <Plus className={cn("h-4 w-4 shrink-0 text-fg-muted transition-transform duration-300", isOpen && "rotate-45 text-accent")} />
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen && (
                <m.div
                  id={panel}
                  role="region"
                  aria-labelledby={btn}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <p className="px-5 pb-5 text-sm leading-relaxed text-fg-secondary sm:px-6">{it.a}</p>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
