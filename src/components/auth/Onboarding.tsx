"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BellRing, CandlestickChart, FlaskConical, LayoutDashboard, Network, Scale, Telescope, Wallet, Waves } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Misc";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { normalizeXrplAddress } from "@/lib/xrpl/address";
import { writeLocal } from "@/lib/storage/local";
import { cn } from "@/lib/utils/cn";
import { trackEvent } from "@/components/marketing/track";
import { readPlatformSettings, syncPlatformSettingsToProfile, writePlatformSettings, type InterestId } from "@/components/settings/platformSettings";
import { InterestsPicker } from "./InterestsPicker";

/** Window event + storage key the Portfolio module can consume to pre-fill a wallet. */
export const ONBOARDING_WALLET_EVENT = "xrpt-onboarding-wallet";
export const ONBOARDING_WALLET_KEY = "onboarding-wallet";

const TOUR = [
  { icon: LayoutDashboard, title: "Dashboard", body: "Your command center — price, regime, portfolio, XRPL activity and alerts at a glance." },
  { icon: CandlestickChart, title: "Market", body: "Live prices and charts, each with its source and freshness." },
  { icon: Network, title: "XRPL", body: "Explore accounts, transactions and large transfers straight from the ledger." },
  { icon: Wallet, title: "Portfolio", body: "Track public addresses read-only — no keys, ever." },
  { icon: Telescope, title: "Future", body: "Scenario ranges with uncertainty — not predictions." },
  { icon: FlaskConical, title: "Trade Lab", body: "Practise with virtual capital. Always labelled SIMULATED." },
];

const ALERT_TEMPLATES = [
  { icon: BellRing, title: "Price move", body: "Notify me when XRP moves more than a set percentage.", href: "/alerts?template=price-move" },
  { icon: Waves, title: "Whale transfer", body: "Notify me about XRPL transfers above a threshold.", href: "/alerts?template=whale" },
  { icon: Scale, title: "Regime change", body: "Notify me when the market regime changes.", href: "/alerts?template=regime" },
];

const STEPS = ["Welcome", "Interests", "Wallet", "Alert"] as const;

/**
 * First-run onboarding (spec §15, §250): tour → interests → optional wallet → optional alert → dashboard.
 * Mount once on the dashboard: `<OnboardingTour />`. It opens automatically until completed or skipped
 * (prefs.onboardingDone). Pass `open`/`onClose` to control it manually (e.g. "Replay tour").
 */
export function OnboardingTour({ open: controlledOpen, onClose }: { open?: boolean; onClose?: () => void }) {
  const { prefs, setPref, hydrated } = usePreferences();
  const { user } = useAuth();
  const [autoOpen, setAutoOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState<InterestId[]>([]);
  const [address, setAddress] = useState("");
  const [addrError, setAddrError] = useState<string | null>(null);
  const [walletSaved, setWalletSaved] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && !prefs.onboardingDone && controlledOpen === undefined) setAutoOpen(true);
  }, [hydrated, prefs.onboardingDone, controlledOpen]);
  useEffect(() => setInterests(readPlatformSettings().interests), []);

  const open = controlledOpen ?? autoOpen;

  const finish = (completed: boolean) => {
    setPref("onboardingDone", true);
    const s = { ...readPlatformSettings(), interests };
    writePlatformSettings(s);
    if (user) void syncPlatformSettingsToProfile(user.id, s);
    if (completed) trackEvent("onboarding_complete", { interests: interests.length, wallet: !!walletSaved });
    setAutoOpen(false);
    setStep(0);
    onClose?.();
  };

  const saveWallet = () => {
    const r = normalizeXrplAddress(address);
    if (!r.ok) {
      setAddrError(r.reason);
      return;
    }
    setAddrError(null);
    writeLocal(ONBOARDING_WALLET_KEY, { address: r.classic, tag: r.tag ?? null, at: Date.now() });
    window.dispatchEvent(new CustomEvent(ONBOARDING_WALLET_EVENT, { detail: { address: r.classic, tag: r.tag ?? null } }));
    setWalletSaved(r.classic);
    setStep(3);
  };

  const footer = (
    <div className="flex w-full items-center justify-between gap-2">
      <Button variant="ghost" size="sm" onClick={() => finish(false)}>
        Skip
      </Button>
      <div className="flex gap-2">
        {step > 0 && (
          <Button variant="secondary" size="sm" onClick={() => setStep((s) => s - 1)} aria-label="Back">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        )}
        {step === 2 ? (
          address.trim() ? (
            <Button size="sm" onClick={saveWallet}>
              Add wallet <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setStep(3)}>
              Skip this step
            </Button>
          )
        ) : step === 3 ? (
          <Button size="sm" onClick={() => finish(true)}>
            Go to dashboard <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" onClick={() => setStep((s) => s + 1)}>
            Next <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={() => finish(false)}
      size="lg"
      title={step === 0 ? "Welcome to XRP Terminal" : STEPS[step]}
      description={`Step ${step + 1} of ${STEPS.length} · takes under a minute`}
      footer={footer}
    >
      <div className="mb-5 grid grid-cols-4 gap-1.5" aria-hidden>
        {STEPS.map((s, i) => (
          <span key={s} className={cn("h-1 rounded-full transition-colors", i <= step ? "bg-accent" : "bg-surface-hover")} />
        ))}
      </div>

      {step === 0 && (
        <div>
          <p className="text-sm text-fg-secondary">A quick tour of the main areas. Everything shows where its data comes from and how fresh it is.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {TOUR.map((t) => (
              <div key={t.title} className="flex gap-3 rounded-xl border border-border-subtle bg-bg-secondary/50 p-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                  <t.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-fg">{t.title}</p>
                  <p className="text-xs leading-relaxed text-fg-muted">{t.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-fg-secondary">Choose what you care about. We&apos;ll use it to prioritise your dashboard — change it any time in Settings.</p>
          <InterestsPicker value={interests} onChange={setInterests} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-fg-secondary">
            Optionally track a public XRPL address. This is read-only: you only share the public address — never a seed phrase or private key.
          </p>
          <Field label="Public XRPL address (r… or X-address)" htmlFor="ob-address" error={addrError} hint="You can add or remove wallets later in Portfolio.">
            <input
              id="ob-address"
              className="input font-mono text-xs"
              placeholder="r…"
              autoComplete="off"
              spellCheck={false}
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setAddrError(null);
              }}
            />
          </Field>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          {walletSaved && (
            <p className="rounded-lg border border-success/30 bg-success/[0.07] px-3 py-2 text-xs text-success">
              Wallet noted. Finish setting it up in{" "}
              <Link href={`/portfolio?add=${encodeURIComponent(walletSaved)}`} className="underline" onClick={() => finish(true)}>
                Portfolio
              </Link>
              .
            </p>
          )}
          <p className="text-sm text-fg-secondary">Optionally start with an alert. Alerts respect cooldowns so they don&apos;t spam you.</p>
          <div className="grid gap-2">
            {ALERT_TEMPLATES.map((a) => (
              <Link
                key={a.title}
                href={a.href}
                onClick={() => finish(true)}
                className="flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-secondary/50 p-3 transition-colors hover:border-accent/40"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                  <a.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-fg">{a.title}</span>
                  <span className="block text-xs text-fg-muted">{a.body}</span>
                </span>
                <ArrowRight className="h-4 w-4 text-fg-muted" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
