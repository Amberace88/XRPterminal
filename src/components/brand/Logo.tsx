import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/** XRP Terminal brand mark + wordmark. The mark is the proprietary XRP Terminal symbol. */
export function LogoMark({ size = 28, className, priority }: { size?: number; className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/mark-256.png"
      alt="XRP Terminal"
      width={size}
      height={size}
      priority={priority}
      className={cn("select-none object-contain", className)}
    />
  );
}

export function Logo({ href = "/", size = 28, className, compact }: { href?: string; size?: number; className?: string; compact?: boolean }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)} aria-label="XRP Terminal home">
      <LogoMark size={size} priority />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-bold tracking-[0.02em] text-fg">
            XRP <span className="font-medium text-fg-secondary">TERMINAL</span>
          </span>
        </span>
      )}
    </Link>
  );
}
