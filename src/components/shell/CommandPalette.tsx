"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { ArrowRight, Hash as HashIcon, Search, Wallet, Layers } from "lucide-react";
import { NAV, EXTRA_DESTINATIONS } from "@/lib/nav";
import { useT } from "@/hooks/useT";
import { classifySearch, normalizeXrplAddress } from "@/lib/xrpl/address";
import { NAV_ICONS } from "./icons";

/** CMD/CTRL+K command palette (spec §131, §182). */
export function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const router = useRouter();
  const t = useT();
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const kind = useMemo(() => classifySearch(q), [q]);
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[85] flex items-start justify-center bg-black/60 px-3 pt-[12vh] backdrop-blur-[2px]" onClick={() => setOpen(false)}>
      <Command
        label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-2xl animate-fade-up"
        onClick={(e) => e.stopPropagation()}
        shouldFilter={kind === "unknown"}
      >
        <div className="flex items-center gap-2 border-b border-border-subtle px-4">
          <Search className="h-4 w-4 text-fg-muted" />
          <Command.Input
            autoFocus
            value={q}
            onValueChange={setQ}
            placeholder={t("common.search")}
            className="h-12 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-2xs text-fg-muted sm:block">ESC</kbd>
        </div>
        <Command.List className="max-h-[55vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-fg-muted">No results.</Command.Empty>
          {kind !== "unknown" && (
            <Command.Group heading="XRP Ledger" className="px-1 text-2xs text-fg-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
              {kind === "account" && (
                <Item onSelect={() => go(`/xrpl/account/${(normalizeXrplAddress(q) as { classic: string }).classic}`)} icon={<Wallet className="h-4 w-4" />}>
                  Open account {q.trim().slice(0, 10)}…
                </Item>
              )}
              {kind === "transaction" && (
                <Item onSelect={() => go(`/xrpl/tx/${q.trim().toUpperCase()}`)} icon={<HashIcon className="h-4 w-4" />}>
                  Open transaction {q.trim().slice(0, 10)}…
                </Item>
              )}
              {kind === "ledger" && (
                <Item onSelect={() => go(`/xrpl/ledger/${q.trim()}`)} icon={<Layers className="h-4 w-4" />}>
                  Open ledger #{q.trim()}
                </Item>
              )}
            </Command.Group>
          )}
          <Command.Group heading="Pages" className="px-1 text-2xs text-fg-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
            {NAV.map((n) => {
              const Icon = NAV_ICONS[n.icon];
              return (
                <Item key={n.href} value={`${t(n.key)} ${n.description}`} onSelect={() => go(n.href)} icon={<Icon className="h-4 w-4" />} hint={n.description}>
                  {t(n.key)}
                </Item>
              );
            })}
          </Command.Group>
          <Command.Group heading="Tools & sections" className="px-1 text-2xs text-fg-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
            {EXTRA_DESTINATIONS.map((d) => (
              <Item key={d.href} value={`${d.label} ${d.section}`} onSelect={() => go(d.href)} icon={<ArrowRight className="h-4 w-4" />} hint={d.section}>
                {d.label}
              </Item>
            ))}
          </Command.Group>
        </Command.List>
        <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2 text-2xs text-fg-muted">
          <span>Paste an XRPL address, tx hash or ledger index to jump directly.</span>
          <span className="hidden sm:inline">↑↓ navigate · ↵ open</span>
        </div>
      </Command>
    </div>
  );
}

function Item({ children, onSelect, icon, hint, value }: { children: React.ReactNode; onSelect: () => void; icon?: React.ReactNode; hint?: string; value?: string }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg-secondary aria-selected:bg-surface-hover aria-selected:text-fg"
    >
      <span className="text-fg-muted">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {hint && <span className="hidden truncate text-2xs text-fg-muted sm:block">{hint}</span>}
    </Command.Item>
  );
}
