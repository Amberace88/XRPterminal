"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu, Moon, Search, Sun, UserRound } from "lucide-react";
import { NAV } from "@/lib/nav";
import { useT } from "@/hooks/useT";
import { cn } from "@/lib/utils/cn";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { NAV_ICONS } from "./icons";
import { LiveTicker } from "./LiveTicker";
import { CommandPalette } from "./CommandPalette";
import { NotificationCenter } from "./NotificationCenter";
import { Drawer } from "@/components/ui/Modal";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useNotifications } from "@/components/providers/NotificationsProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import type { Fiat } from "@/lib/types/market";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function SideNav({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const t = useT();
  const { profile } = useAuth();
  const groups: { id: "main" | "secondary" | "admin"; label: string }[] = [
    { id: "main", label: "Intelligence" },
    { id: "secondary", label: "Tools" },
  ];
  if (profile?.role === "admin") groups.push({ id: "admin", label: "Admin" });
  return (
    <nav className="flex flex-col gap-5 px-3 py-4" aria-label="Primary">
      {groups.map((g) => (
        <div key={g.id}>
          {!collapsed && <div className="label mb-1.5 px-2">{g.label}</div>}
          <ul className="space-y-0.5">
            {NAV.filter((n) => n.group === g.id).map((n) => {
              const Icon = NAV_ICONS[n.icon];
              const active = isActive(pathname, n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                      active ? "bg-accent/10 text-fg" : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
                    )}
                  >
                    {active && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />}
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-accent" : "text-fg-muted group-hover:text-fg-secondary")} />
                    <span className="truncate">{t(n.key)}</span>
                    {n.badge && <Badge tone="accent" className="ml-auto scale-90">{n.badge}</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function MobileBottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const t = useT();
  const items = NAV.filter((n) => n.mobilePrimary);
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="Mobile primary"
    >
      <ul className="grid grid-cols-6">
        {items.map((n) => {
          const Icon = NAV_ICONS[n.icon];
          const active = isActive(pathname, n.href);
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium", active ? "text-accent" : "text-fg-muted")}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate">{n.href === "/dashboard" ? t("nav.home") : t(n.key)}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button onClick={onMore} className="flex w-full flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-fg-muted">
            <Menu className="h-5 w-5" />
            {t("nav.more")}
          </button>
        </li>
      </ul>
    </nav>
  );
}

export function TerminalShell({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { prefs, setPref } = usePreferences();
  const { unread } = useNotifications();
  const { user, isGuest, enabled } = useAuth();
  const t = useT();

  return (
    <div className="min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border-subtle bg-bg-secondary/60 lg:flex">
        <div className="flex h-14 items-center border-b border-border-subtle px-4">
          <Logo href="/dashboard" size={26} />
        </div>
        <div className="flex-1 overflow-y-auto">
          <SideNav />
        </div>
        <div className="border-t border-border-subtle p-3 text-2xs leading-relaxed text-fg-muted">
          Independent analytics platform. Not affiliated with Ripple Labs Inc. Not investment advice.
        </div>
      </aside>

      <div className="lg:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border-subtle bg-bg/85 px-3 backdrop-blur-md sm:px-5">
          <Link href="/dashboard" className="lg:hidden" aria-label="Dashboard">
            <LogoMark size={26} />
          </Link>
          <LiveTicker className="min-w-0" />
          <div className="flex-1" />
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden h-9 w-72 items-center gap-2 rounded-lg border border-border-subtle bg-surface px-3 text-left text-xs text-fg-muted transition hover:border-border md:flex"
            aria-label="Open search"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">{t("common.search")}</span>
            <kbd className="rounded border border-border px-1 text-[10px]">⌘K</kbd>
          </button>
          <button onClick={() => setPaletteOpen(true)} className="rounded-lg p-2 text-fg-secondary hover:bg-surface-hover md:hidden" aria-label="Search">
            <Search className="h-4 w-4" />
          </button>
          <select
            value={prefs.currency}
            onChange={(e) => setPref("currency", e.target.value as Fiat)}
            className="hidden h-8 rounded-md border border-border-subtle bg-surface px-2 text-xs text-fg-secondary sm:block"
            aria-label="Display currency"
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
          <button
            onClick={() => setPref("theme", prefs.theme === "dark" ? "light" : "dark")}
            className="hidden rounded-lg p-2 text-fg-secondary hover:bg-surface-hover sm:block"
            aria-label="Toggle theme"
          >
            {prefs.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button onClick={() => setNotifOpen(true)} className="relative rounded-lg p-2 text-fg-secondary hover:bg-surface-hover" aria-label={`Notifications (${unread} unread)`}>
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>
            )}
          </button>
          <Link
            href={isGuest ? (enabled ? "/login" : "/settings") : "/settings"}
            className="flex items-center gap-2 rounded-lg border border-border-subtle px-2 py-1.5 text-xs text-fg-secondary hover:bg-surface-hover"
          >
            <UserRound className="h-4 w-4" />
            <span className="hidden max-w-[120px] truncate sm:inline">{user?.email ?? (enabled ? t("common.signIn") : "Guest")}</span>
          </Link>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1600px] px-3 pb-28 pt-5 sm:px-5 lg:pb-12">
          {children}
        </main>
      </div>

      <MobileBottomNav onMore={() => setDrawer(true)} />
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="XRP Terminal" side="left">
        <SideNav onNavigate={() => setDrawer(false)} />
        <div className="flex items-center gap-2 border-t border-border-subtle p-4">
          <select
            value={prefs.currency}
            onChange={(e) => setPref("currency", e.target.value as Fiat)}
            className="select h-9 text-xs"
            aria-label="Display currency"
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
          <button onClick={() => setPref("theme", prefs.theme === "dark" ? "light" : "dark")} className="rounded-lg border border-border p-2 text-fg-secondary" aria-label="Toggle theme">
            {prefs.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </Drawer>
      <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} />
      <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} />
    </div>
  );
}
