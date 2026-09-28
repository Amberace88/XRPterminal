"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

/** Admin navigation (spec §236). */
export const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/revenue", label: "Revenue" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/providers", label: "Providers" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/errors", label: "Errors" },
  { href: "/admin/ai", label: "AI" },
  { href: "/admin/forecasts", label: "Forecasts" },
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/system", label: "System" },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="-mx-3 mb-5 overflow-x-auto border-b border-border-subtle px-3 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {ADMIN_NAV.map((n) => {
          const active = n.href === "/admin" ? pathname === "/admin" : pathname === n.href || pathname.startsWith(n.href + "/");
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative block whitespace-nowrap px-3 py-2.5 text-sm transition-colors",
                  active ? "text-fg" : "text-fg-secondary hover:text-fg",
                )}
              >
                {n.label}
                {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
