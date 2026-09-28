"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock } from "lucide-react";
import { PLANS, type PlanDefinition, type PlanId } from "@/lib/entitlements";
import { formatMoney } from "@/lib/format";
import { Button, ButtonLink } from "@/components/ui/Button";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { apiPost, ApiError } from "@/hooks/useApi";
import { cn } from "@/lib/utils/cn";
import { trackEvent } from "./track";
import { TiltCard } from "./motion";

const ORDER: PlanId[] = ["free", "pro", "proplus"];

/** Start Stripe Checkout for a paid plan. Entitlements change only via the verified webhook. */
export function useCheckout() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<PlanId | null>(null);
  const start = async (plan: Exclude<PlanId, "free">) => {
    setPending(plan);
    trackEvent("checkout_started", { plan });
    try {
      const r = await apiPost<{ url: string }>("/api/billing/checkout", { plan });
      window.location.assign(r.url);
    } catch (e) {
      setPending(null);
      if (e instanceof ApiError && e.status === 401) {
        router.push(`/login?next=${encodeURIComponent("/pricing")}`);
        return;
      }
      toast({ title: "Checkout unavailable", description: e instanceof Error ? e.message : "Please try again.", tone: "warning" });
    }
  };
  return { start, pending };
}

function PlanCta({ plan, billingEnabled, accountsEnabled }: { plan: PlanDefinition; billingEnabled: boolean; accountsEnabled: boolean }) {
  const { user, plan: current } = useAuth();
  const { start, pending } = useCheckout();
  const featured = plan.id === "pro";
  if (plan.id === "free") {
    if (user && current === "free")
      return (
        <Button variant="secondary" className="w-full" disabled>
          Current plan
        </Button>
      );
    return (
      <ButtonLink href={accountsEnabled && !user ? "/signup" : "/dashboard"} variant="secondary" className="w-full">
        {user ? "Open Terminal" : "Start Free"}
      </ButtonLink>
    );
  }
  if (!billingEnabled)
    return (
      <Button variant={featured ? "primary" : "secondary"} className="w-full" disabled aria-describedby="billing-note">
        <Lock className="h-3.5 w-3.5" /> Billing not yet enabled
      </Button>
    );
  if (user && current === plan.id)
    return (
      <ButtonLink href="/settings#billing" variant="secondary" className="w-full">
        Current plan · Manage
      </ButtonLink>
    );
  if (!user)
    return (
      <ButtonLink href={`/signup?plan=${plan.id}`} variant={featured ? "primary" : "secondary"} className="w-full">
        Choose {plan.name}
      </ButtonLink>
    );
  return (
    <Button variant={featured ? "primary" : "secondary"} className="w-full" loading={pending === plan.id} onClick={() => start(plan.id as "pro" | "proplus")}>
      {current === "free" ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
    </Button>
  );
}

export function PricingCards({ billingEnabled, accountsEnabled, className }: { billingEnabled: boolean; accountsEnabled: boolean; className?: string }) {
  return (
    <div className={className}>
      <div className="grid gap-4 lg:grid-cols-3">
        {ORDER.map((id) => {
          const p = PLANS[id];
          const featured = id === "pro";
          return (
            <TiltCard key={id} max={3} className="rounded-2xl">
              <div
                className={cn(
                  "relative flex h-full flex-col rounded-2xl border p-6 sm:p-7",
                  featured
                    ? "border-accent/40 bg-gradient-to-b from-accent/[0.09] via-surface to-surface shadow-glow"
                    : "border-border-subtle bg-surface",
                )}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold tracking-tight text-fg">{p.name}</h3>
                  {featured && <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-2xs font-semibold text-accent-strong">For active users</span>}
                </div>
                <p className="mt-1 text-sm text-fg-secondary">{p.tagline}</p>
                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="num text-4xl font-semibold tracking-tight text-fg">{p.priceEurMonthly === 0 ? "€0" : formatMoney(p.priceEurMonthly, "EUR")}</span>
                  <span className="text-sm text-fg-muted">/ month</span>
                </div>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {p.highlights.map((h) => (
                    <li key={h} className="flex gap-2.5 text-sm text-fg-secondary">
                      <Check className={cn("mt-0.5 h-4 w-4 shrink-0", featured ? "text-accent" : "text-success")} />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-7">
                  <PlanCta plan={p} billingEnabled={billingEnabled} accountsEnabled={accountsEnabled} />
                </div>
              </div>
            </TiltCard>
          );
        })}
      </div>
      <p id="billing-note" className="mt-5 text-center text-xs text-fg-muted">
        Prices in EUR per month. Applicable taxes may be added at checkout depending on your location. Cancel any time.
        {!billingEnabled && " Paid plans open once billing is enabled — every Free feature works today."}
      </p>
    </div>
  );
}
