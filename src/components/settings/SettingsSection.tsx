import { cn } from "@/lib/utils/cn";

export function SettingsSection({
  id,
  title,
  description,
  children,
  actions,
  tone,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("card scroll-mt-32 lg:scroll-mt-20", tone === "danger" && "border-danger/30")}>
      <div className="flex flex-col gap-2 border-b border-border-subtle px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div>
          <h2 id={`${id}-title`} className={cn("text-sm font-semibold text-fg", tone === "danger" && "text-danger")}>
            {title}
          </h2>
          {description && <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

export function SettingRow({ label, description, children }: { label: React.ReactNode; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-border-subtle/60 py-3 first:pt-0 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm text-fg">{label}</p>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function GuestNotice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border bg-bg-secondary/50 px-3 py-2.5 text-xs leading-relaxed text-fg-secondary">{children}</div>;
}
