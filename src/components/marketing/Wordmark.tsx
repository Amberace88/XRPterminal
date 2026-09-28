import { cn } from "@/lib/utils/cn";

/** Text wordmark (the PNG wordmark has dark text and is only for light backgrounds). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[15px] font-bold tracking-[0.08em] text-fg", className)}>
      XRP <span className="font-medium text-fg-secondary">TERMINAL</span>
    </span>
  );
}
