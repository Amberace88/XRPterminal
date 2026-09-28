import Image from "next/image";
import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";

/** Split auth layout: brand panel (desktop) + form card. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-16">
      <div className="relative hidden overflow-hidden rounded-3xl border border-border-subtle bg-gradient-to-br from-surface via-bg-secondary to-bg p-10 lg:block">
        <div aria-hidden className="grid-bg absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]" />
        <div aria-hidden className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative">
          <Image src="/brand/mark-512.webp" alt="" width={72} height={72} className="h-[72px] w-[72px] object-contain" />
          <p className="mt-8 text-sm font-bold tracking-[0.3em] text-fg">
            XRP <span className="font-medium text-fg-secondary">TERMINAL</span>
          </p>
          <p className="mt-3 text-4xl font-semibold leading-tight tracking-tight">
            <span className="text-gradient">See beyond</span> <span className="accent-gradient">the price.</span>
          </p>
          <ul className="mt-10 space-y-4">
            {[
              "Real data with visible source and freshness",
              "Non-custodial — never asks for seed phrases or private keys",
              "Free plan with live market data, XRPL explorer and a simulated Trade Lab",
            ].map((t) => (
              <li key={t} className="flex gap-3 text-sm text-fg-secondary">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                  <Check className="h-3 w-3" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md">
        <div className="rounded-2xl border border-border-subtle bg-surface p-6 shadow-card sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-fg-secondary">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-fg-secondary">{footer}</div>}
        <p className="mt-6 flex items-start justify-center gap-2 text-center text-2xs leading-relaxed text-fg-muted">
          <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            XRP Terminal will never ask for your seed phrase or private key. By continuing you agree to the{" "}
            <Link href="/legal/terms" className="underline hover:text-fg">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="underline hover:text-fg">
              Privacy Policy
            </Link>
            .
          </span>
        </p>
      </div>
    </div>
  );
}

/** Shown on auth pages when Supabase is not configured for this deployment. */
export function AccountsDisabled() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border-subtle bg-bg-secondary/60 p-4 text-sm leading-relaxed text-fg-secondary">
        <p className="font-medium text-fg">Accounts aren&apos;t enabled on this deployment yet.</p>
        <p className="mt-1.5">
          You can use XRP Terminal fully in <strong className="text-fg">guest mode</strong>: live data, the XRPL explorer, portfolio tracking and the simulated Trade
          Lab all work — your settings and data are stored in this browser only.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-white shadow-[0_0_0_1px_rgb(var(--accent)/0.4),0_6px_20px_-6px_rgb(var(--accent)/0.6)] transition hover:bg-accent-strong"
      >
        Continue as guest
      </Link>
      <p className="text-center text-2xs text-fg-muted">You can export your guest data at any time from Settings → Data export.</p>
    </div>
  );
}
