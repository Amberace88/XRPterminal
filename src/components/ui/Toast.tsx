"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type ToastTone = "info" | "success" | "warning" | "danger";
interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

const Ctx = createContext<{ toast: (t: Omit<ToastItem, "id" | "tone"> & { tone?: ToastTone }) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((t: Omit<ToastItem, "id" | "tone"> & { tone?: ToastTone }) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-3), { id, tone: t.tone ?? "info", title: t.title, description: t.description }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-20 right-3 z-[90] flex w-[min(92vw,360px)] flex-col gap-2 lg:bottom-4" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface-elevated p-3 shadow-2xl animate-fade-up"
          >
            {t.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
            ) : t.tone === "warning" || t.tone === "danger" ? (
              <TriangleAlert className={cn("mt-0.5 h-4 w-4", t.tone === "danger" ? "text-danger" : "text-warning")} />
            ) : (
              <Info className="mt-0.5 h-4 w-4 text-accent" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-fg-muted">{t.description}</p>}
            </div>
            <button onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} className="text-fg-muted hover:text-fg" aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast must be used within ToastProvider");
  return c.toast;
}
