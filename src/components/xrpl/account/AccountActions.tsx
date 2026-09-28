"use client";

import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Tag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/providers/AuthProvider";
import { getWatchlistRepo, WATCHLIST_CHANGED_EVENT } from "@/lib/alerts/repo";
import type { WatchItem } from "@/lib/alerts/types";
import type { LabelCategory, WalletLabel } from "@/lib/xrpl/labels";

/** Watch / unwatch an address via the shared watchlist (used by wallet alerts). */
export function WatchButton({ address, label }: { address: string; label?: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const [item, setItem] = useState<WatchItem | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const repo = getWatchlistRepo(user?.id ?? null);
    const load = () =>
      repo
        .list()
        .then((l) => setItem(l.find((x) => x.kind === "wallet" && x.value === address) ?? null))
        .catch(() => setItem(null));
    load();
    window.addEventListener(WATCHLIST_CHANGED_EVENT, load);
    return () => window.removeEventListener(WATCHLIST_CHANGED_EVENT, load);
  }, [user?.id, address]);
  const toggle = async () => {
    const repo = getWatchlistRepo(user?.id ?? null);
    setBusy(true);
    try {
      if (item) {
        await repo.remove(item.id);
        setItem(null);
      } else {
        const it: WatchItem = { id: crypto.randomUUID(), kind: "wallet", value: address, label: label || address, createdAt: Date.now() };
        await repo.add(it);
        setItem(it);
        toast({ title: "Watching wallet", description: "Find it on the XRPL hub and use it in wallet alerts.", tone: "success" });
      }
    } catch (e) {
      toast({ title: "Watchlist", description: (e as Error).message, tone: "warning" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant={item ? "outline" : "secondary"} size="sm" onClick={toggle} loading={busy} aria-pressed={!!item}>
      {item ? <BookmarkCheck className="h-3.5 w-3.5 text-accent" /> : <Bookmark className="h-3.5 w-3.5" />}
      {item ? "Watching" : "Watch"}
    </Button>
  );
}

const CATEGORIES: LabelCategory[] = ["UNKNOWN", "EXCHANGE", "ISSUER", "KNOWN_SERVICE", "KNOWN_ENTITY", "TRADER", "HOLDER"];

/** Add / edit / remove the user's own (private, user-provided) label for an address. */
export function LabelEditor({
  address,
  existing,
  onSave,
  onRemove,
  storage,
}: {
  address: string;
  existing: WalletLabel | null;
  onSave: (name: string, category: LabelCategory) => Promise<void>;
  onRemove: () => Promise<void>;
  storage: "local" | "account";
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(existing?.name ?? "");
  const [cat, setCat] = useState<LabelCategory>(existing?.category ?? "UNKNOWN");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(existing?.name ?? "");
    setCat(existing?.category ?? "UNKNOWN");
  }, [existing]);
  const save = async () => {
    const n = name.trim();
    if (!n) return setErr("Enter a label");
    setBusy(true);
    try {
      await onSave(n, cat);
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Tag className="h-3.5 w-3.5" /> {existing ? "Edit my label" : "Add label"}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Your label for this address"
        description={`Private and marked "user-provided" — ${storage === "account" ? "saved to your account" : "saved in this browser only"}. It is never shown as a verified fact.`}
        size="sm"
        footer={
          <>
            {existing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await onRemove();
                  setOpen(false);
                }}
              >
                Remove
              </Button>
            )}
            <Button size="sm" onClick={save} loading={busy}>
              Save label
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="break-all font-mono text-2xs text-fg-muted">{address}</p>
          <Field label="Label" htmlFor="user-label" error={err}>
            <input id="user-label" className="input" maxLength={60} value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} placeholder="e.g. My cold wallet" />
          </Field>
          <Field label="Category" htmlFor="user-label-cat" hint="Your own categorisation. 'Smart money' is not available as a user label.">
            <select id="user-label-cat" className="select" value={cat} onChange={(e) => setCat(e.target.value as LabelCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace("_", " ").toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Modal>
    </>
  );
}
