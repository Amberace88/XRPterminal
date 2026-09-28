import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Ban, Bot, Database, Eye, Fingerprint, KeyRound, Lock, Mail, ScrollText, ShieldCheck, type LucideIcon } from "lucide-react";
import { SectionHeading } from "@/components/marketing/sections";
import { ParallaxGrid } from "@/components/marketing/motion";
import { CONTACT_EMAIL, PERMISSION_MODEL } from "@/components/marketing/content";
import { cn } from "@/lib/utils/cn";

const DESCRIPTION =
  "How XRP Terminal protects you: non-custodial architecture, read-only connections, no seed phrases or private keys ever, encrypted credentials, row-level security, audited admin actions and clear scam guidance.";

export const metadata: Metadata = {
  title: "Security",
  description: DESCRIPTION,
  alternates: { canonical: "/security" },
  openGraph: { title: "Security · XRP Terminal", description: DESCRIPTION, url: "/security", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "Security · XRP Terminal", description: DESCRIPTION, images: ["/og.png"] },
};

const NEVER = [
  "hold XRP, other crypto-assets or fiat for you",
  "accept deposits or process withdrawals",
  "ask for, store or transmit seed phrases or private keys",
  "sign blockchain transactions on your behalf",
  "execute real trades — Trade Lab is simulation only",
];

const BLOCKS: { icon: LucideIcon; title: string; points: string[] }[] = [
  {
    icon: Lock,
    title: "Data protection",
    points: [
      "All traffic is served over HTTPS with HSTS; the site cannot be framed by other origins.",
      "Read-only exchange credentials are encrypted at rest with a server-side key and are never returned to the browser or shown to administrators.",
      "Server secrets (database service key, billing and AI keys) exist only on the server and are never exposed to your browser.",
      "Structured logs redact anything that looks like a key, secret, token or password.",
    ],
  },
  {
    icon: Database,
    title: "Access control",
    points: [
      "Every user-owned table is protected by PostgreSQL row-level security — an account can read only its own private data.",
      "Plan, role and subscription fields cannot be changed by users; they are set only by verified billing webhooks or audited admin actions.",
      "Administrator access is verified on the server for every request, never from a flag in the browser.",
      "Sensitive actions — sign-ins, password changes, subscription changes, data exports, account deletion, admin actions — are written to an append-only audit log.",
    ],
  },
  {
    icon: Fingerprint,
    title: "Account security",
    points: [
      "Email verification, password reset and magic-link sign-in.",
      "Sign out every session at once from Settings → Security.",
      "In-app notices for sign-ins from a new browser or device and for password changes.",
      "Rate limiting on authentication and sensitive endpoints to slow brute-force attempts.",
      "Two-factor authentication is on the roadmap; the account architecture is prepared for it.",
    ],
  },
  {
    icon: Bot,
    title: "AI & data integrity",
    points: [
      "Numbers are calculated by deterministic code — the AI explains results, it is never the source of a figure.",
      "External text (news, posts, web pages) is passed to the model as data, never as instructions, to resist prompt injection.",
      "Facts, analysis, scenarios and speculation are labelled separately, with sources you can open.",
      "Every important data point shows its provider and timestamp; stale data is marked as stale.",
    ],
  },
];

export default function SecurityPage() {
  return (
    <>
      <section className="relative isolate overflow-hidden pb-16 pt-14 sm:pt-20">
        <ParallaxGrid className="opacity-40" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="Security & trust"
            title="Built so it cannot move your funds."
            description="XRP Terminal is an analytics platform — not a wallet, not a broker, not an exchange. Security starts with what the product is architecturally unable to do."
          />
        </div>
      </section>

      <section className="pb-16" aria-labelledby="never-title">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border-subtle bg-surface p-6 sm:p-8">
            <h2 id="never-title" className="flex items-center gap-2 text-lg font-semibold text-fg">
              <Ban className="h-5 w-5 text-danger" /> XRP Terminal will never
            </h2>
            <ul className="mt-5 space-y-3">
              {NEVER.map((n) => (
                <li key={n} className="flex gap-3 text-sm text-fg-secondary">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-danger/80" />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-bg-secondary p-6 font-mono shadow-card sm:p-8">
            <h2 className="flex items-center gap-2 font-sans text-lg font-semibold text-fg">
              <Eye className="h-5 w-5 text-accent" /> Connection permission model
            </h2>
            <p className="mt-2 font-sans text-sm text-fg-secondary">Wallets are tracked by public address. Exchange connections are designed for read-only API keys.</p>
            <dl className="mt-5 space-y-2.5 text-sm">
              {PERMISSION_MODEL.map((p) => (
                <div key={p.scope} className="flex items-center gap-3">
                  <dt className="text-fg-secondary">{p.scope}</dt>
                  <span aria-hidden className="h-px flex-1 border-t border-dashed border-border" />
                  <dd className={cn("font-semibold", p.value === "YES" ? "text-success" : p.value === "NEVER" ? "text-danger" : "text-fg")}>{p.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="pb-16">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:px-6 md:grid-cols-2">
          {BLOCKS.map((b) => (
            <div key={b.title} className="rounded-2xl border border-border-subtle bg-surface p-6 sm:p-7">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent">
                <b.icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-fg">{b.title}</h2>
              <ul className="mt-3 space-y-2.5">
                {b.points.map((p) => (
                  <li key={p} className="flex gap-2.5 text-sm leading-relaxed text-fg-secondary">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success/80" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-16" aria-labelledby="scam-title">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="rounded-2xl border border-warning/30 bg-warning/[0.05] p-6 sm:p-8">
            <h2 id="scam-title" className="flex items-center gap-2 text-lg font-semibold text-fg">
              <AlertTriangle className="h-5 w-5 text-warning" /> Protect yourself from scams
            </h2>
            <ul className="mt-4 grid gap-3 text-sm text-fg-secondary md:grid-cols-2">
              <li className="flex gap-2.5">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> Nobody from XRP Terminal will ever ask for your seed phrase, private key or passwords.
              </li>
              <li className="flex gap-2.5">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> We do not offer support through unsolicited direct messages.
              </li>
              <li className="flex gap-2.5">
                <Ban className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> &quot;Send XRP and receive more back&quot; giveaways are always scams.
              </li>
              <li className="flex gap-2.5">
                <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> Check that you are on the official domain before signing in.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="pb-28" aria-labelledby="disclosure-title">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="rounded-2xl border border-border-subtle bg-surface p-6 sm:p-8">
            <h2 id="disclosure-title" className="text-lg font-semibold text-fg">
              Responsible disclosure
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-secondary">
              If you believe you have found a security vulnerability, please email{" "}
              <a href={`mailto:${CONTACT_EMAIL}?subject=Security%20report`} className="text-accent-strong hover:underline">
                {CONTACT_EMAIL}
              </a>{" "}
              with the subject &quot;Security report&quot; and enough detail to reproduce it. Please do not access other users&apos; data, degrade the service or
              publicly disclose the issue before we have had a reasonable opportunity to fix it. See also our{" "}
              <Link href="/legal/privacy" className="text-accent-strong hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
