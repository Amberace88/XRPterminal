import { cn } from "@/lib/utils/cn";
import { InfoTip } from "./Tooltip";

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  info,
  actions,
  className,
  icon,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  info?: string;
  actions?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon && <span className="text-accent">{icon}</span>}
          <h3 className="truncate text-sm font-semibold tracking-tight text-fg">{title}</h3>
          {info && <InfoTip text={info} />}
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-4 pb-4 pt-3 sm:px-5 sm:pb-5", className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex items-center justify-between gap-2 border-t border-border-subtle px-4 py-2.5 text-2xs text-fg-muted sm:px-5", className)}>{children}</div>;
}
