"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { readLocal, writeLocal } from "@/lib/storage/local";
import { trackEvent } from "@/components/marketing/track";
import { cn } from "@/lib/utils/cn";

const KEY = "academy-progress";

export function useAcademyProgress() {
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    const load = () => setDone(readLocal<string[]>(KEY, []));
    load();
    const onStore = (e: Event) => {
      if ((e as CustomEvent<{ key: string }>).detail?.key === KEY) load();
    };
    window.addEventListener("xrpt-storage", onStore);
    return () => window.removeEventListener("xrpt-storage", onStore);
  }, []);
  const toggle = (slug: string) => {
    const cur = readLocal<string[]>(KEY, []);
    const next = cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug];
    writeLocal(KEY, next);
    setDone(next);
    if (!cur.includes(slug)) trackEvent("academy_module_completed", { module: slug });
  };
  return { done, toggle };
}

export function CompletionMark({ slug, className }: { slug: string; className?: string }) {
  const { done } = useAcademyProgress();
  return done.includes(slug) ? (
    <CheckCircle2 className={cn("h-4 w-4 text-success", className)} aria-label="Completed" />
  ) : (
    <Circle className={cn("h-4 w-4 text-fg-muted/50", className)} aria-label="Not completed" />
  );
}

export function ProgressSummary({ total }: { total: number }) {
  const { done } = useAcademyProgress();
  const pct = total ? Math.round((done.length / total) * 100) : 0;
  return (
    <div className="card card-pad">
      <div className="flex items-center justify-between">
        <span className="label">Your progress</span>
        <span className="num text-sm text-fg">
          {done.length} / {total}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-hover" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-2xs text-fg-muted">Progress is saved in this browser.</p>
    </div>
  );
}

export function MarkCompleteButton({ slug }: { slug: string }) {
  const { done, toggle } = useAcademyProgress();
  const isDone = done.includes(slug);
  return (
    <Button variant={isDone ? "secondary" : "primary"} size="sm" onClick={() => toggle(slug)} aria-pressed={isDone}>
      {isDone ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4" />}
      {isDone ? "Completed" : "Mark as complete"}
    </Button>
  );
}
