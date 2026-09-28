import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/marketing/LegalPage";
import { CONTACT_EMAIL } from "@/components/marketing/content";
import { INDEPENDENCE_STATEMENT } from "@/lib/config";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of XRP Terminal: platform purpose, non-custody, simulation, data, AI and forecast limitations, subscriptions, acceptable use and liability.",
  alternates: { canonical: "/legal/terms" },
};

const sections: LegalSection[] = [
  {
    id: "purpose",
    title: "Platform purpose",
    content: (
      <>
        <p>
          XRP Terminal is independent software that provides information, analytics, research tools, scenario modelling, educational content and a paper-trading
          simulator relating to XRP and the XRP Ledger. It is provided for informational, analytical and educational purposes only.
        </p>
        <p>
          Nothing on XRP Terminal is personalised investment advice, portfolio management, a recommendation or solicitation to buy, sell or hold any crypto-asset,
          or a guarantee of future performance. You are solely responsible for your own decisions. {INDEPENDENCE_STATEMENT}
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Eligibility and accounts",
    content: (
      <>
        <p>You must be at least 18 years old and legally able to enter into these terms to create an account or purchase a subscription.</p>
        <p>
          Much of the service can be used without an account (&quot;guest mode&quot;), in which case your settings and data are stored only in your browser. If you
          create an account you must provide accurate information, keep your credentials confidential and tell us promptly about any unauthorised use.
        </p>
      </>
    ),
  },
  {
    id: "non-custody",
    title: "Non-custodial service",
    content: (
      <>
        <p>XRP Terminal does not and will not:</p>
        <ul>
          <li>hold, custody, transfer or safeguard crypto-assets or fiat currency for you;</li>
          <li>accept deposits or process withdrawals;</li>
          <li>ask for, store or use seed phrases or private keys;</li>
          <li>sign blockchain transactions or execute real trades on your behalf.</li>
        </ul>
        <p>
          You may connect public XRP Ledger addresses and, where supported, read-only exchange API keys. You must not provide API keys with trading, withdrawal
          or transfer permissions. Never share a seed phrase or private key with anyone, including anyone claiming to represent us.
        </p>
      </>
    ),
  },
  {
    id: "simulation",
    title: "Simulation (Trade Lab)",
    content: (
      <p>
        Trade Lab, historical replay, strategy backtests, challenges and any &quot;mimic&quot; features are simulations using virtual capital. No orders are sent to
        any exchange. Simulated fills, fees and slippage are models and cannot reproduce every condition of live markets. Simulated or past performance does not
        guarantee future results.
      </p>
    ),
  },
  {
    id: "data",
    title: "Data limitations",
    content: (
      <>
        <p>
          Market, ledger, news and other data come from third-party sources and public networks. Data may be delayed, incomplete, inaccurate, revised or
          temporarily unavailable. We show the source and freshness of important data points, but we do not guarantee accuracy, completeness or timeliness.
        </p>
        <p>Wallet labels and entity attributions are informational and may be wrong; they indicate their source and confidence where available.</p>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI limitations",
    content: (
      <p>
        AI features generate explanations and summaries with a large language model. AI output can be incomplete or incorrect, may misinterpret sources and must
        not be relied on as a statement of fact without checking the cited sources. Numerical results shown in the product are calculated by deterministic code,
        not by the AI. You are responsible for how you use AI output.
      </p>
    ),
  },
  {
    id: "forecasts",
    title: "Forecast and scenario limitations",
    content: (
      <p>
        Future intelligence presents scenario ranges derived from models and historical behaviour. Scenarios are not predictions, price targets or
        recommendations. Models have limitations, historical relationships can break down, and actual outcomes can fall outside any displayed range. Published
        forecasts are kept unchanged for transparency, including when they turn out to be wrong.
      </p>
    ),
  },
  {
    id: "third-parties",
    title: "Third-party providers",
    content: (
      <p>
        The service relies on third parties such as hosting, database, payment, AI and data providers, and public XRP Ledger servers. Their availability and terms
        are outside our control. Links to third-party websites are provided for convenience; we are not responsible for their content. Where affiliate
        relationships exist, they will be clearly disclosed.
      </p>
    ),
  },
  {
    id: "subscriptions",
    title: "Subscriptions and billing",
    content: (
      <>
        <ul>
          <li>Paid plans are monthly subscriptions billed in advance through our payment processor, Stripe. Prices are shown in EUR; applicable taxes may be added.</li>
          <li>Subscriptions renew automatically each month until cancelled. You can cancel at any time in Settings → Billing; access continues until the end of the paid period.</li>
          <li>Your plan is activated when our payment processor confirms payment to us. Plan limits are described on the pricing page and may evolve; we will give reasonable notice of material reductions.</li>
          <li>We may change prices with at least 30 days&apos; notice before your next renewal. If you do not agree, you may cancel before the change takes effect.</li>
          <li>If a payment fails, we may downgrade your account to the Free plan after the payment processor&apos;s retry period. Your data is kept.</li>
          <li>Nothing in these terms limits any statutory rights you have as a consumer, including any applicable right of withdrawal.</li>
        </ul>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    content: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>use the service for any unlawful purpose, fraud, market manipulation or to promote scams;</li>
          <li>impersonate any person or organisation, or misrepresent verified or trading performance;</li>
          <li>post content that is harassing, defamatory, infringing or deliberately misleading;</li>
          <li>scrape, bulk-download or resell data, or circumvent rate limits, plan limits or access controls;</li>
          <li>probe, scan or test the vulnerability of the service except under our responsible-disclosure process;</li>
          <li>interfere with the service, upload malware or attempt to access another user&apos;s data;</li>
          <li>reverse engineer the service except as permitted by law.</li>
        </ul>
        <p>You remain responsible for content you post. You grant us a non-exclusive licence to host and display it within the service for as long as it is published.</p>
      </>
    ),
  },
  {
    id: "ip",
    title: "Intellectual property",
    content: (
      <p>
        The XRP Terminal name, logo, software, design and original content are our property or licensed to us. Third-party names and trademarks, including
        references to XRP, the XRP Ledger and exchanges, are used only descriptively and belong to their respective owners; their use does not imply
        endorsement. Academy content is provided for your personal, non-commercial learning.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Disclaimers and limitation of liability",
    content: (
      <>
        <p>
          The service is provided &quot;as is&quot; and &quot;as available&quot;. To the fullest extent permitted by law, we disclaim all warranties, express or
          implied, including fitness for a particular purpose and non-infringement.
        </p>
        <p>
          To the extent permitted by law, we are not liable for any trading or investment losses, lost profits, or indirect or consequential losses arising from
          your use of or reliance on the service, data, AI output, scenarios or simulations. Our total liability for any claim relating to the service is limited to
          the amount you paid us in the 12 months before the claim. Nothing in these terms excludes liability that cannot be excluded by law, such as liability for
          death or personal injury caused by negligence or for fraud.
        </p>
      </>
    ),
  },
  {
    id: "termination",
    title: "Suspension and termination",
    content: (
      <>
        <p>
          You may stop using the service and delete your account at any time from Settings → Delete account. We may suspend or terminate accounts that breach these
          terms, create security risks or are required to be suspended by law. Where reasonable, we will tell you why and give you an opportunity to respond.
        </p>
        <p>On termination, your right to use paid features ends. Data is deleted or anonymised as described in the Privacy Policy.</p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes, governing law and contact",
    content: (
      <>
        <p>
          We may update these terms. Material changes will be announced in the product or by email before they take effect. Continued use after that date means
          you accept the updated terms.
        </p>
        <p>
          These terms are governed by the laws of the jurisdiction in which the operator of XRP Terminal is established, without prejudice to mandatory consumer
          protection laws of your country of residence. Questions:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent-strong hover:underline">
            {CONTACT_EMAIL}
          </a>
          . See also the <Link href="/legal/privacy" className="text-accent-strong hover:underline">Privacy Policy</Link> and{" "}
          <Link href="/legal/risk" className="text-accent-strong hover:underline">Risk Disclosure</Link>.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      current="/legal/terms"
      title="Terms of Service"
      intro={<p>These Terms of Service govern your access to and use of XRP Terminal (the &quot;service&quot;). By using the service you agree to them.</p>}
      sections={sections}
    />
  );
}
