import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/marketing/LegalPage";
import { INDEPENDENCE_STATEMENT, LEGAL_DISCLAIMER, PAPER_DISCLAIMER } from "@/lib/config";

export const metadata: Metadata = {
  title: "Disclaimer",
  description: "XRP Terminal is independent analytics software. Information is not investment advice; scenarios are not predictions; simulations are not real trading.",
  alternates: { canonical: "/legal/disclaimer" },
};

const sections: LegalSection[] = [
  { id: "general", title: "General disclaimer", content: <p>{LEGAL_DISCLAIMER}</p> },
  { id: "independence", title: "Independence", content: <p>{INDEPENDENCE_STATEMENT} References to XRP, the XRP Ledger and third-party services are descriptive only.</p> },
  {
    id: "information",
    title: "Information only",
    content: (
      <p>
        Content on XRP Terminal — including prices, statistics, wallet labels, news summaries, AI output, academy lessons, scenario ranges and model outputs — is
        general information. It does not take into account your objectives, financial situation or needs. Consider seeking independent professional advice
        before making financial decisions.
      </p>
    ),
  },
  {
    id: "scenarios",
    title: "Scenarios are not predictions",
    content: (
      <p>
        Future intelligence shows ranges of plausible outcomes with their uncertainty. They are not forecasts of a specific price, targets or signals, and
        outcomes outside the displayed ranges are possible.
      </p>
    ),
  },
  { id: "simulation", title: "Simulation", content: <p>Trade Lab and all related features are simulated with virtual capital. {PAPER_DISCLAIMER}</p> },
  {
    id: "accuracy",
    title: "Accuracy and availability",
    content: (
      <p>
        Data is provided &quot;as is&quot; from third-party and public sources, with visible source and freshness indicators. We cannot guarantee that it is
        accurate, complete or current at all times. See the <Link href="/legal/risk" className="text-accent-strong hover:underline">Risk Disclosure</Link> and{" "}
        <Link href="/legal/terms" className="text-accent-strong hover:underline">Terms of Service</Link>.
      </p>
    ),
  },
];

export default function DisclaimerPage() {
  return <LegalPage current="/legal/disclaimer" title="Disclaimer" intro={<p>Please read this disclaimer before relying on anything you see in XRP Terminal.</p>} sections={sections} />;
}
