import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/marketing/LegalPage";
import { CookieSettingsButton } from "@/components/marketing/CookieSettingsButton";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "Which cookies and browser storage XRP Terminal uses — strictly necessary, analytics and marketing — and how to change your choice.",
  alternates: { canonical: "/legal/cookies" },
};

const NECESSARY: { name: string; type: string; purpose: string; duration: string }[] = [
  { name: "sb-*-auth-token", type: "Cookie", purpose: "Keeps you signed in (only when you have an account)", duration: "Session refresh, up to the auth session lifetime" },
  { name: "xrpt:prefs", type: "Local storage", purpose: "Theme, language, currency, time zone and layout preferences", duration: "Until you clear it" },
  { name: "xrpt:cookie-consent", type: "Local storage", purpose: "Remembers your cookie choice", duration: "12 months, then we ask again" },
  { name: "xrpt:* (guest data)", type: "Local storage", purpose: "Guest-mode data such as watchlists, tracked wallets, alerts and paper trades", duration: "Until you clear it" },
  { name: "xrpt:referral", type: "Local storage", purpose: "Referral code from a link you followed, used only to attribute a signup", duration: "30 days" },
  { name: "xrpt:ref-click:*", type: "Session storage", purpose: "Prevents counting the same referral click twice", duration: "Browser session" },
];

const sections: LegalSection[] = [
  {
    id: "overview",
    title: "Our approach",
    content: (
      <p>
        We use only strictly necessary cookies and browser storage by default. Optional categories are off until you switch them on, and you can change your
        choice at any time.
      </p>
    ),
  },
  {
    id: "necessary",
    title: "Strictly necessary",
    content: (
      <>
        <p>These are required for the service to work and cannot be switched off.</p>
        <div className="my-4 overflow-x-auto rounded-xl border border-border-subtle">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-bg-secondary/60">
              <tr>
                <th className="px-4 py-2 font-medium text-fg">Name</th>
                <th className="px-4 py-2 font-medium text-fg">Type</th>
                <th className="px-4 py-2 font-medium text-fg">Purpose</th>
                <th className="px-4 py-2 font-medium text-fg">Duration</th>
              </tr>
            </thead>
            <tbody>
              {NECESSARY.map((c) => (
                <tr key={c.name} className="border-t border-border-subtle align-top">
                  <td className="px-4 py-2 font-mono text-xs text-fg">{c.name}</td>
                  <td className="px-4 py-2 text-fg-secondary">{c.type}</td>
                  <td className="px-4 py-2 text-fg-secondary">{c.purpose}</td>
                  <td className="px-4 py-2 text-fg-secondary">{c.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: "analytics",
    title: "Analytics (optional)",
    content: (
      <p>
        If you allow analytics, we record a small set of first-party product events (for example &quot;onboarding completed&quot; or &quot;paper trade
        placed&quot;) to understand which features are used. These events contain no personal data beyond your account identifier when signed in, and no
        third-party analytics trackers are currently used. With analytics off, no events are sent.
      </p>
    ),
  },
  {
    id: "marketing",
    title: "Marketing (optional)",
    content: <p>We do not currently use marketing or advertising cookies. The setting exists so that any future use would respect the choice you have already made.</p>,
  },
  {
    id: "third-party",
    title: "Third-party connections",
    content: (
      <p>
        Some live data is streamed directly from your browser to public data services such as XRP Ledger servers. These connections do not set cookies from
        XRP Terminal, but the operators can see your IP address. Stripe Checkout, if you use it, runs on Stripe&apos;s own pages under Stripe&apos;s cookie policy.
      </p>
    ),
  },
  {
    id: "manage",
    title: "Managing your choice",
    content: (
      <>
        <p>You can review or change your choice at any time:</p>
        <p>
          <CookieSettingsButton className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-hover" label="Open cookie settings" />
        </p>
        <p>You can also clear site data in your browser settings; this signs you out and removes guest-mode data.</p>
      </>
    ),
  },
];

export default function CookiesPage() {
  return <LegalPage current="/legal/cookies" title="Cookie Policy" intro={<p>This policy explains how XRP Terminal uses cookies and similar browser storage.</p>} sections={sections} />;
}
