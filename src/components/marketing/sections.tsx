"use client";

import Image from "next/image";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Ban,
  BellRing,
  CandlestickChart,
  Check,
  Database,
  Eye,
  FlaskConical,
  History,
  KeyRound,
  Lock,
  Network,
  ShieldCheck,
  Sparkles,
  Telescope,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { FEATURE_SECTIONS, PERMISSION_MODEL, SCREEN_QUESTIONS, SECURITY_POINTS, type FeatureSection } from "./content";
import { CountUp, ParallaxGrid, Reveal, RevealItem, TiltCard, m } from "./motion";
import { HeroTerminal } from "./HeroTerminal";
import { LivePulse } from "./LivePulse";
import { VISUALS } from "./visuals";

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
  id,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
  id?: string;
}) {
  return (
    <Reveal className={cn(align === "center" && "mx-auto text-center", "max-w-3xl", className)}>
      <RevealItem as="p" className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
        {eyebrow}
      </RevealItem>
      <RevealItem as="h2" className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-fg sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
        <span id={id}>{title}</span>
      </RevealItem>
      {description && (
        <RevealItem as="p" className="mt-4 text-base leading-relaxed text-fg-secondary sm:text-lg">
          {description}
        </RevealItem>
      )}
    </Reveal>
  );
}

/* ------------------------------------------------------------------ hero */
const LINES = [
  ["SEE", "BEYOND"],
  ["THE", "PRICE."],
];
export function Hero({ accountsEnabled }: { accountsEnabled: boolean }) {
  const reduce = useReducedMotion();
  return (
    <section className="relative isolate overflow-hidden" aria-labelledby="hero-title">
      <ParallaxGrid />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-18rem] -z-10 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-accent/[0.12] blur-[120px]" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[1.02fr_1fr] lg:gap-10 lg:pb-28 lg:pt-20">
        <div>
          <m.div
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-4"
          >
            <m.div
              animate={reduce ? undefined : { y: [0, -5, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="relative"
            >
              <div aria-hidden className="absolute inset-2 rounded-full bg-accent/25 blur-2xl" />
              <Image src="/brand/mark-512.webp" alt="XRP Terminal logo" width={84} height={84} priority className="relative h-[72px] w-[72px] object-contain sm:h-[84px] sm:w-[84px]" />
            </m.div>
            <div>
              <p className="text-sm font-bold tracking-[0.32em] text-fg">
                XRP <span className="font-medium text-fg-secondary">TERMINAL</span>
              </p>
              <p className="mt-1.5 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface/60 px-2.5 py-1 text-2xs font-medium text-fg-secondary backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Independent XRP & XRPL intelligence
              </p>
            </div>
          </m.div>

          <h1 id="hero-title" className="mt-8 text-[2.9rem] font-semibold leading-[0.98] tracking-[-0.035em] sm:text-6xl lg:text-7xl xl:text-[5.25rem]">
            {LINES.map((line, li) => (
              <span key={li} className="block">
                {line.map((w, wi) => {
                  const i = li * 2 + wi;
                  return (
                    <m.span
                      key={w}
                      className={cn("mr-[0.22em] inline-block last:mr-0", li === 1 ? "accent-gradient" : "text-gradient")}
                      initial={reduce ? false : { opacity: 0, y: 28, filter: "blur(6px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{ duration: 0.7, delay: 0.1 + i * 0.09, ease: [0.2, 0.7, 0.2, 1] }}
                    >
                      {w}
                    </m.span>
                  );
                })}
              </span>
            ))}
          </h1>

          <m.p
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="mt-6 max-w-xl text-base leading-relaxed text-fg-secondary sm:text-lg"
          >
            Market intelligence, XRP Ledger intelligence, portfolio tracking, AI research, historical intelligence, future scenarios and paper trading — in one
            calm, professional terminal. Real data, visible sources, no custody.
          </m.p>

          <m.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.62 }}
            className="mt-8 flex flex-col gap-3 sm:flex-row"
          >
            <ButtonLink href={accountsEnabled ? "/signup" : "/dashboard"} size="lg" className="group">
              Start Free <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </ButtonLink>
            <ButtonLink href="/dashboard" size="lg" variant="secondary">
              Explore Terminal
            </ButtonLink>
          </m.div>
          <m.p
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted"
          >
            {["Free plan", "No card required", "Non-custodial", "Never asks for keys"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success" /> {t}
              </span>
            ))}
          </m.p>

          <m.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.9 }} className="mt-10">
            <LivePulse />
          </m.div>
        </div>

        <HeroTerminal className="mx-auto w-full max-w-[620px] lg:max-w-none" />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ principles strip */
export function PrinciplesStrip() {
  const items = ["Non-custodial", "Read-only connections", "Provenance on every data point", "Scenarios, not predictions", "Simulation clearly labelled", "No seed phrases — ever"];
  const reduce = useReducedMotion();
  const row = [...items, ...items];
  return (
    <div className="relative overflow-hidden border-y border-border-subtle bg-bg-secondary/40 py-4 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]" aria-label="Product principles">
      <div className={cn("flex w-max gap-10 whitespace-nowrap", !reduce && "animate-ticker")}>
        {row.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-2.5 text-sm text-fg-secondary" aria-hidden={i >= items.length}>
            <ShieldCheck className="h-4 w-4 text-accent/80" /> {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ product overview */
const OVERVIEW: { icon: LucideIcon; title: string; body: string; href: string; span?: string }[] = [
  { icon: CandlestickChart, title: "Market", body: "Live prices, candles, regime and risk with visible freshness.", href: "#market", span: "lg:col-span-2" },
  { icon: Network, title: "XRPL", body: "Explorer, whale stream, wallet profiler.", href: "#xrpl" },
  { icon: Wallet, title: "Portfolio", body: "Read-only wallets & exchanges, cost basis, P&L.", href: "#portfolio" },
  { icon: Sparkles, title: "AI", body: "Sourced briefs & Claim Check — facts separated from opinion.", href: "#ai" },
  { icon: History, title: "Historical", body: "Cycles, drawdowns, recoveries, seasonality.", href: "#historical" },
  { icon: Telescope, title: "Future", body: "Scenario ranges with uncertainty and model versioning.", href: "#future", span: "lg:col-span-2" },
  { icon: FlaskConical, title: "Trade Lab", body: "Paper trading, historical replay and strategy tests — always labelled simulated.", href: "#tradelab", span: "lg:col-span-2" },
  { icon: Users, title: "Social", body: "Verified traders & sentiment (beta).", href: "#social" },
  { icon: BellRing, title: "Alerts", body: "Price, wallet, whale, regime & forecast alerts.", href: "#alerts" },
];

export function ProductOverview() {
  return (
    <section id="product" className="scroll-mt-20 py-20 sm:py-28" aria-labelledby="product-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          id="product-title"
          eyebrow="Product overview"
          title={
            <>
              One terminal. <span className="text-fg-secondary">Every lens on XRP.</span>
            </>
          }
          description="Market data, the ledger itself, your holdings and your practice trades share one data model — so every view agrees, and every number tells you where it came from."
        />
        <Reveal className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" stagger={0.05}>
          {OVERVIEW.map((o) => (
            <RevealItem key={o.title} className={cn("h-full", o.span)}>
              <TiltCard className="h-full rounded-2xl">
                <Link
                  href={o.href}
                  className="flex h-full flex-col rounded-2xl border border-border-subtle bg-surface/80 p-5 transition-colors hover:border-border focus-visible:border-accent"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-xl border border-border-subtle bg-bg-secondary text-accent transition-colors group-hover:border-accent/40">
                    <o.icon className="h-5 w-5" />
                  </span>
                  <span className="mt-5 flex items-center gap-1.5 text-base font-semibold text-fg">
                    {o.title}
                    <ArrowUpRight className="h-4 w-4 text-fg-muted opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="mt-1.5 text-sm leading-relaxed text-fg-secondary">{o.body}</span>
                </Link>
              </TiltCard>
            </RevealItem>
          ))}
        </Reveal>

        <Reveal className="mt-16 rounded-2xl border border-border-subtle bg-gradient-to-r from-surface via-surface to-accent/[0.06] p-6 sm:p-8">
          <RevealItem as="p" className="label">
            Every screen answers
          </RevealItem>
          <div className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {SCREEN_QUESTIONS.map((q) => (
              <RevealItem key={q} className="flex items-center gap-3 text-sm text-fg sm:text-base">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                  <Check className="h-3.5 w-3.5" />
                </span>
                {q}
              </RevealItem>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ feature sections */
export function FeatureBlock({ section, index }: { section: FeatureSection; index: number }) {
  const Visual = VISUALS[section.visual];
  const flip = index % 2 === 1;
  return (
    <section id={section.id} className="scroll-mt-20 py-14 sm:py-20" aria-labelledby={`${section.id}-title`}>
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
        <div className={cn(flip && "lg:order-2")}>
          <Reveal>
            <RevealItem as="p" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              {section.eyebrow}
              {section.badge === "BETA" && <span className="rounded border border-accent/30 bg-accent/10 px-1.5 py-px text-[10px] tracking-wider text-accent-strong">BETA</span>}
              {section.badge === "SIMULATED" && (
                <span className="rounded border border-dashed border-warning/40 bg-warning/10 px-1.5 py-px text-[10px] tracking-wider text-warning">SIMULATED</span>
              )}
            </RevealItem>
            <RevealItem as="h2" className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-fg sm:text-4xl">
              <span id={`${section.id}-title`}>{section.title}</span>
            </RevealItem>
            <RevealItem as="p" className="mt-4 text-base leading-relaxed text-fg-secondary sm:text-lg">
              {section.body}
            </RevealItem>
            <Reveal as="ul" className="mt-6 space-y-3" stagger={0.06}>
              {section.points.map((p) => (
                <RevealItem as="li" key={p} className="flex gap-3 text-sm text-fg-secondary sm:text-base">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent">
                    <Check className="h-3 w-3" />
                  </span>
                  {p}
                </RevealItem>
              ))}
            </Reveal>
            <RevealItem className="mt-8">
              <Link href={section.href} className="group inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong hover:text-fg">
                {section.cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </RevealItem>
          </Reveal>
        </div>
        <Reveal className={cn(flip && "lg:order-1")}>
          <RevealItem>
            <TiltCard max={3} className="rounded-2xl">
              <Visual />
            </TiltCard>
          </RevealItem>
        </Reveal>
      </div>
    </section>
  );
}

export function FeatureSections() {
  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute left-[calc(50%-1px)] top-0 hidden h-full w-px bg-gradient-to-b from-transparent via-border-subtle to-transparent lg:block" />
      {FEATURE_SECTIONS.map((s, i) => (
        <FeatureBlock key={s.id} section={s} index={i} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ facts (real, derived from code) */
export function FactsBand({ facts }: { facts: { value: number; label: string; suffix?: string }[] }) {
  return (
    <section className="border-y border-border-subtle bg-bg-secondary/40 py-14" aria-label="Product facts">
      <Reveal className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 sm:px-6 lg:grid-cols-4" stagger={0.08}>
        {facts.map((f) => (
          <RevealItem key={f.label} className="text-center lg:text-left">
            <div className="text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
              <CountUp value={f.value} />
              {f.suffix && <span className="text-accent">{f.suffix}</span>}
            </div>
            <p className="mt-2 text-sm text-fg-secondary">{f.label}</p>
          </RevealItem>
        ))}
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ security */
const SEC_ICONS: Record<string, LucideIcon> = { KeyRound, Ban, Eye, Lock, Database, FlaskConical };

export function SecuritySection() {
  return (
    <section id="security" className="scroll-mt-20 py-20 sm:py-28" aria-labelledby="security-title">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div>
          <SectionHeading
            id="security-title"
            eyebrow="Security"
            title="Non-custodial by architecture."
            description="XRP Terminal is an analytics platform, not a wallet or an exchange. It is built so that it cannot move your funds — and it will never ask for the secrets that could."
          />
          <Reveal className="mt-8">
            <RevealItem>
              <div className="overflow-hidden rounded-2xl border border-border bg-bg-secondary font-mono text-sm shadow-card">
                <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5 text-2xs text-fg-muted">
                  <Lock className="h-3.5 w-3.5 text-accent" /> api-permission-model
                </div>
                <dl className="space-y-2 p-4">
                  {PERMISSION_MODEL.map((p) => (
                    <div key={p.scope} className="flex items-center gap-3">
                      <dt className="text-fg-secondary">{p.scope}</dt>
                      <span aria-hidden className="h-px flex-1 border-t border-dashed border-border" />
                      <dd className={cn("font-semibold", p.value === "YES" ? "text-success" : p.value === "NEVER" ? "text-danger" : "text-fg")}>{p.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </RevealItem>
            <RevealItem className="mt-6">
              <Link href="/security" className="group inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong hover:text-fg">
                Read the security overview <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </RevealItem>
          </Reveal>
        </div>
        <Reveal className="grid gap-3 sm:grid-cols-2" stagger={0.06}>
          {SECURITY_POINTS.map((p) => {
            const Icon = SEC_ICONS[p.icon];
            return (
              <RevealItem key={p.title} className="h-full">
                <TiltCard className="h-full rounded-2xl" max={4}>
                  <div className="h-full rounded-2xl border border-border-subtle bg-surface p-5">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-base font-semibold text-fg">{p.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-fg-secondary">{p.body}</p>
                  </div>
                </TiltCard>
              </RevealItem>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ final CTA */
export function FinalCta({ accountsEnabled }: { accountsEnabled: boolean }) {
  return (
    <section className="px-4 py-20 sm:px-6 sm:py-28" aria-labelledby="cta-title">
      <Reveal className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface-elevated via-surface to-bg-secondary px-6 py-14 text-center sm:px-12 sm:py-20">
        <div aria-hidden className="grid-bg pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
        <RevealItem className="relative mx-auto w-fit">
          <Image src="/brand/mark-512.webp" alt="" width={64} height={64} className="h-16 w-16 object-contain" />
        </RevealItem>
        <RevealItem as="h2" className="relative mt-6 text-3xl font-semibold tracking-[-0.02em] text-fg sm:text-5xl">
          <span id="cta-title">Start with real data.</span>
        </RevealItem>
        <RevealItem as="p" className="relative mx-auto mt-4 max-w-xl text-base text-fg-secondary sm:text-lg">
          The Free plan is genuinely useful: live market data, the XRPL explorer, historical statistics, scenario ranges and a simulated Trade Lab. No card required.
        </RevealItem>
        <RevealItem className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href={accountsEnabled ? "/signup" : "/dashboard"} size="lg">
            Start Free <ArrowRight className="h-4 w-4" />
          </ButtonLink>
          <ButtonLink href="/dashboard" size="lg" variant="secondary">
            Explore Terminal
          </ButtonLink>
        </RevealItem>
      </Reveal>
    </section>
  );
}
