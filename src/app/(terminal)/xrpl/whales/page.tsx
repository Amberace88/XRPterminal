import type { Metadata } from "next";
import { Disclaimer, PageHeader } from "@/components/ui/Misc";
import { WhalesView } from "@/components/xrpl/WhalesView";

export const metadata: Metadata = {
  title: "XRP whale transfers — live large XRPL payments | XRP Terminal",
  description:
    "Live feed of large XRP payments on the XRP Ledger, measured by the amount actually delivered. Exchange inflows and outflows shown only where public labels exist. Large transfers are not buy or sell signals.",
  robots: { index: true, follow: true },
};

export default function WhalesPage() {
  return (
    <>
      <PageHeader title="Whale transfers" description="Large XRP payments observed live on the XRP Ledger in this session. Amounts are delivered amounts from ledger metadata." />
      <WhalesView />
      <Disclaimer short className="mt-6" />
    </>
  );
}
