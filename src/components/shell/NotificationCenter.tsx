"use client";

import Link from "next/link";
import { BellOff, CheckCheck } from "lucide-react";
import { Drawer } from "@/components/ui/Modal";
import { useNotifications } from "@/components/providers/NotificationsProvider";
import { EmptyState } from "@/components/ui/States";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatAge } from "@/lib/format";
import { cn } from "@/lib/utils/cn";

export function NotificationCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, unread, markRead, markAllRead, clear } = useNotifications();
  return (
    <Drawer open={open} onClose={onClose} title={`Notifications${unread ? ` · ${unread} unread` : ""}`}>
      {items.length === 0 ? (
        <EmptyState
          icon={<BellOff className="h-5 w-5" />}
          title="No notifications yet"
          description="Alerts you configure (price, wallet, regime, Trade Lab) will appear here."
          action={
            <Link href="/alerts" onClick={onClose} className="text-xs text-accent hover:underline">
              Configure alerts →
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex justify-end gap-1 border-b border-border-subtle px-3 py-2">
            <Button variant="ghost" size="xs" onClick={markAllRead}>
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </Button>
            <Button variant="ghost" size="xs" onClick={clear}>
              Clear
            </Button>
          </div>
          <ul>
            {items.map((n) => {
              const inner = (
                <div className={cn("flex gap-3 border-b border-border-subtle/70 px-4 py-3", !n.read && "bg-accent/[0.04]")}>
                  <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-accent")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge tone={n.priority === "critical" ? "danger" : "neutral"}>{n.category}</Badge>
                      <span className="text-2xs text-fg-muted">{formatAge(n.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-fg">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs text-fg-muted">{n.body}</p>}
                  </div>
                </div>
              );
              return (
                <li key={n.id} onClick={() => markRead(n.id)}>
                  {n.href ? (
                    <Link href={n.href} onClick={onClose}>
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Drawer>
  );
}
