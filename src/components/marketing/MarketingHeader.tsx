"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { ArrowRight, Menu, X } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { useAuth } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils/cn";
import { MARKETING_NAV } from "./content";
import { m } from "./motion";
import { Wordmark } from "./Wordmark";

/** Sticky translucent public header with mobile menu. */
export function MarketingHeader({ accountsEnabled }: { accountsEnabled: boolean }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const startHref = accountsEnabled ? "/signup" : "/dashboard";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = (href: string) => !href.startsWith("/#") && (pathname === href || pathname.startsWith(href + "/"));
  const signedIn = !!user;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-colors duration-300",
        scrolled || open ? "border-border-subtle bg-bg/80 backdrop-blur-xl" : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="XRP Terminal home">
          <LogoMark size={30} priority />
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
          {MARKETING_NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-2 text-sm transition-colors",
                isActive(n.href) ? "text-fg" : "text-fg-secondary hover:bg-surface-hover/60 hover:text-fg",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          {signedIn ? (
            <ButtonLink href="/dashboard" size="sm">
              Open Terminal <ArrowRight className="h-3.5 w-3.5" />
            </ButtonLink>
          ) : (
            <>
              {accountsEnabled && (
                <Link href="/login" className={cn("rounded-lg px-3 py-2 text-sm text-fg-secondary transition-colors hover:text-fg", loading && "opacity-60")}>
                  Sign in
                </Link>
              )}
              <ButtonLink href={startHref} size="sm">
                Start Free
              </ButtonLink>
            </>
          )}
        </div>

        <button
          type="button"
          className="ml-auto rounded-lg p-2 text-fg-secondary hover:bg-surface-hover md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <m.div
            id="mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border-subtle bg-bg/95 px-4 pb-10 pt-4 backdrop-blur-xl md:hidden"
          >
            <nav aria-label="Mobile" className="flex flex-col">
              {MARKETING_NAV.map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="flex items-center justify-between border-b border-border-subtle py-4 text-base text-fg">
                  {n.label}
                  <ArrowRight className="h-4 w-4 text-fg-muted" />
                </Link>
              ))}
            </nav>
            <div className="mt-6 grid gap-3">
              {signedIn ? (
                <ButtonLink href="/dashboard" size="lg">
                  Open Terminal
                </ButtonLink>
              ) : (
                <>
                  <ButtonLink href={startHref} size="lg">
                    Start Free
                  </ButtonLink>
                  <ButtonLink href="/dashboard" size="lg" variant="secondary">
                    Explore Terminal
                  </ButtonLink>
                  {accountsEnabled && (
                    <ButtonLink href="/login" size="lg" variant="ghost">
                      Sign in
                    </ButtonLink>
                  )}
                </>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </header>
  );
}
