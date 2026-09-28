import type { Metadata } from "next";
import { Disclaimer, PageHeader } from "@/components/ui/Misc";
import { ActivityView } from "@/components/xrpl/ActivityView";

export const metadata: Metadata = {
  title: "XRP Ledger network activity — live transactions, fees, DEX & RLUSD | XRP Terminal",
  description:
    "Live XRP Ledger activity: transactions per ledger, transaction type mix, fees burned, new accounts, XRP payment volume, DEX offers and RLUSD on-ledger data — aggregated from the validated transaction stream.",
  robots: { index: true, follow: true },
};

export default function ActivityPage() {
  return (
    <>
      <PageHeader title="Network activity" description="What the XRP Ledger is doing right now — aggregated from every validated ledger observed in this session." />
      <ActivityView />
      <Disclaimer short className="mt-6" />
    </>
  );
}
