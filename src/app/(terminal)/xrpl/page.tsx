import type { Metadata } from "next";
import { PageHeader, Disclaimer } from "@/components/ui/Misc";
import { XrplHub } from "@/components/xrpl/XrplHub";

export const metadata: Metadata = {
  title: "XRP Ledger Explorer — live ledgers, transactions & wallets | XRP Terminal",
  description:
    "Independent XRP Ledger explorer: search addresses, X-addresses, transaction hashes and ledgers. Live validated ledgers, network status, whale transfers, network activity and wallet intelligence — all data read directly from XRPL servers.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/xrpl" },
};

export default function XrplPage() {
  return (
    <>
      <PageHeader
        title="XRP Ledger Explorer"
        description="Search the XRP Ledger and watch it close in real time. Every value on these pages is read directly from public XRPL servers — nothing is estimated or backfilled."
      />
      <XrplHub />
      <section className="mt-8 grid gap-6 text-sm leading-relaxed text-fg-secondary md:grid-cols-3" aria-label="About this explorer">
        <div>
          <h2 className="mb-1 text-sm font-semibold text-fg">What is shown here</h2>
          <p>
            Validated ledgers close every few seconds. For each ledger we show the index, close time, number of transactions and the fee and reserve settings the network voted on.
            Transaction pages lead with the result code, then the amount actually delivered, the fee, and every ledger object the transaction changed.
          </p>
        </div>
        <div>
          <h2 className="mb-1 text-sm font-semibold text-fg">Delivered amount, not stated amount</h2>
          <p>
            Payments on the XRP Ledger can be partial: the <code className="font-mono text-xs">Amount</code> field is a maximum. We always use the ledger&apos;s
            <code className="font-mono text-xs"> delivered_amount</code> from transaction metadata, so large-transfer figures cannot be inflated by partial payments.
          </p>
        </div>
        <div>
          <h2 className="mb-1 text-sm font-semibold text-fg">Labels have provenance</h2>
          <p>
            Account names come from XRPScan&apos;s public well-known list, from an account&apos;s own self-declared Domain field, or from you (marked user-provided).
            Behavioural classifications are rule-based and always explain why they apply. We never call a wallet &quot;smart money&quot; from its balance.
          </p>
        </div>
      </section>
      <Disclaimer short className="mt-6" />
    </>
  );
}
