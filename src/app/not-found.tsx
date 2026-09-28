import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: true } };

export default function NotFound() {
  return (
    <main id="main" className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4">
      <div aria-hidden className="grid-bg absolute inset-0 -z-10 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      <div className="max-w-md text-center">
        <Image src="/brand/mark-512.webp" alt="XRP Terminal" width={72} height={72} className="mx-auto h-[72px] w-[72px] object-contain" priority />
        <p className="num mt-8 text-sm font-semibold tracking-[0.3em] text-accent">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg">This page is off the chart.</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-secondary">The page you are looking for doesn&apos;t exist or has moved. If you followed a wallet or transaction link, try searching for it in the XRPL explorer.</p>
        <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
          <Link href="/dashboard" className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-strong">
            Open dashboard
          </Link>
          <Link href="/xrpl" className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-surface-elevated px-4 text-sm font-medium text-fg hover:bg-surface-hover">
            XRPL explorer
          </Link>
          <Link href="/" className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm text-fg-secondary hover:text-fg">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
