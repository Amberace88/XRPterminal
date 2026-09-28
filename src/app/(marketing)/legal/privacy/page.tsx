import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/marketing/LegalPage";
import { CONTACT_EMAIL } from "@/components/marketing/content";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What personal data XRP Terminal collects, why, how long it is kept, which processors are involved, and how to exercise your GDPR rights including export and deletion.",
  alternates: { canonical: "/legal/privacy" },
};

const PROCESSORS: { name: string; purpose: string; data: string }[] = [
  { name: "Supabase", purpose: "Database and authentication", data: "Account, profile, settings and content you store in your account" },
  { name: "Netlify", purpose: "Website hosting and serverless functions", data: "Request metadata such as IP address and user agent in server logs" },
  { name: "Stripe", purpose: "Payments and subscription billing", data: "Email, billing details, payment method (held by Stripe), subscription status" },
  { name: "Anthropic", purpose: "AI features (briefs, research, Claim Check, coaching)", data: "The prompt and context you submit to an AI feature; not used by us to identify you" },
  {
    name: "Market & ledger data providers",
    purpose: "Prices, supply, FX and XRP Ledger data (e.g. Coinbase, Kraken, Bitstamp, Binance, CoinGecko, ECB reference rates, public XRPL servers)",
    data: "Our servers send no personal data. Where your browser connects directly to a public feed (e.g. XRPL WebSocket servers), that operator can see your IP address.",
  },
];

const sections: LegalSection[] = [
  {
    id: "controller",
    title: "Who we are",
    content: (
      <p>
        This policy explains how the operator of XRP Terminal (&quot;we&quot;) processes personal data as data controller. Contact us about privacy at{" "}
        <a href={`mailto:${CONTACT_EMAIL}?subject=Privacy`} className="text-accent-strong hover:underline">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    ),
  },
  {
    id: "collect",
    title: "What data we collect",
    content: (
      <>
        <h3>Guest mode</h3>
        <p>
          Without an account, your preferences, watchlists, wallets you track, alerts, paper trades and journal are stored in your browser&apos;s local storage. We
          do not receive them.
        </p>
        <h3>Account data</h3>
        <ul>
          <li>Email address, authentication identifiers and (if you use one) a password, which is stored only as a secure hash by our authentication provider.</li>
          <li>Profile and preferences: display name, time zone, language, currency, notification, privacy and social-visibility settings, interests you choose.</li>
          <li>Content you create: tracked public wallet addresses, labels, alerts, watchlists, paper-trading records, journal entries, strategies, social posts and reports.</li>
          <li>Read-only exchange API credentials, if you connect an exchange — stored encrypted and never displayed again.</li>
          <li>Subscription data: plan, status and Stripe customer and subscription identifiers. Card details are held by Stripe, not by us.</li>
        </ul>
        <h3>Security and technical data</h3>
        <ul>
          <li>IP address, used transiently for rate limiting and abuse prevention, and stored only as a salted hash for referral fraud checks.</li>
          <li>A non-reversible fingerprint of your browser type, used to notify you of sign-ins from a new device.</li>
          <li>Audit records of security-relevant actions (sign-ins, password changes, subscription changes, exports, deletion requests).</li>
          <li>Product analytics events (for example &quot;onboarding completed&quot;) — only if you consent to analytics.</li>
        </ul>
      </>
    ),
  },
  {
    id: "why",
    title: "Why we use it (legal bases)",
    content: (
      <ul>
        <li><strong>Contract</strong> — to provide your account, sync your data, process subscriptions and deliver the features you use.</li>
        <li><strong>Legitimate interests</strong> — to secure the service, prevent fraud and abuse, keep audit trails and improve reliability.</li>
        <li><strong>Consent</strong> — for optional analytics; you can withdraw consent at any time via Cookie settings.</li>
        <li><strong>Legal obligation</strong> — to keep billing and accounting records and respond to lawful requests.</li>
      </ul>
    ),
  },
  {
    id: "processors",
    title: "Third-party processors",
    content: (
      <>
        <p>We use the following service providers. They process data on our behalf under data-processing terms, or as independent providers where noted.</p>
        <div className="my-4 overflow-x-auto rounded-xl border border-border-subtle">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-bg-secondary/60">
              <tr>
                <th className="px-4 py-2 font-medium text-fg">Provider</th>
                <th className="px-4 py-2 font-medium text-fg">Purpose</th>
                <th className="px-4 py-2 font-medium text-fg">Data involved</th>
              </tr>
            </thead>
            <tbody>
              {PROCESSORS.map((p) => (
                <tr key={p.name} className="border-t border-border-subtle align-top">
                  <td className="px-4 py-2 text-fg">{p.name}</td>
                  <td className="px-4 py-2 text-fg-secondary">{p.purpose}</td>
                  <td className="px-4 py-2 text-fg-secondary">{p.data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Some providers may process data outside the European Economic Area. Where they do, transfers rely on appropriate safeguards such as the European
          Commission&apos;s Standard Contractual Clauses or an adequacy decision.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep data",
    content: (
      <ul>
        <li>Account data: for as long as your account exists. When you delete your account, it is deleted or irreversibly anonymised.</li>
        <li>Security audit logs: up to 24 months, then deleted. After account deletion they are kept only in anonymised form.</li>
        <li>Billing records: as long as accounting and tax law requires (held by Stripe and in our accounting records).</li>
        <li>Records of privacy requests (export, deletion): kept in anonymised form to demonstrate compliance.</li>
        <li>Guest-mode data: in your browser until you clear it or use Settings → Delete data.</li>
      </ul>
    ),
  },
  {
    id: "security",
    title: "Security",
    content: (
      <p>
        We use encryption in transit, encrypted storage of exchange credentials, row-level security on user data, server-side authorisation for administrative
        actions and append-only audit logs. No system is perfectly secure; if we become aware of a breach affecting your data we will notify you and the
        competent authority as required by law. See our <Link href="/security" className="text-accent-strong hover:underline">security overview</Link>.
      </p>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    content: (
      <>
        <p>Depending on where you live, including under the GDPR, you have the right to:</p>
        <ul>
          <li>access your personal data and receive a copy (Settings → Data export, JSON or CSV);</li>
          <li>rectify inaccurate data (Settings → Account);</li>
          <li>erase your data (Settings → Delete account);</li>
          <li>restrict or object to certain processing, including processing based on legitimate interests;</li>
          <li>data portability;</li>
          <li>withdraw consent at any time without affecting earlier processing (Cookie settings);</li>
          <li>lodge a complaint with your local data-protection supervisory authority.</li>
        </ul>
        <p>For anything you cannot do in Settings, email us. We respond within one month.</p>
      </>
    ),
  },
  {
    id: "deletion",
    title: "Account deletion",
    content: (
      <p>
        When you delete your account, we cancel any active subscription, delete your profile and all data linked to your account (wallet lists, alerts, paper
        trading, journal, strategies, notifications, exchange connections) and anonymise records we must retain, such as audit and billing records.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    content: <p>XRP Terminal is not directed to anyone under 18, and we do not knowingly collect personal data from children.</p>,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    content: (
      <p>
        We will update this policy when our processing changes and show the date of the latest version above. Material changes will be announced in the product.
        See also the <Link href="/legal/cookies" className="text-accent-strong hover:underline">Cookie Policy</Link>.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      current="/legal/privacy"
      title="Privacy Policy"
      intro={<p>We collect as little personal data as we can, use it only to run XRP Terminal, and give you direct controls to export or delete it.</p>}
      sections={sections}
    />
  );
}
