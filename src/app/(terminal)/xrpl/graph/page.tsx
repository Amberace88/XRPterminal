import { Suspense } from "react";
import type { Metadata } from "next";
import { TrustBadge } from "@/components/ui/Badge";
import { Disclaimer, PageHeader } from "@/components/ui/Misc";
import { SkeletonRows } from "@/components/ui/States";
import { GraphView } from "@/components/xrpl/GraphView";

export const metadata: Metadata = {
  title: "XRPL entity graph — observed payment flows | XRP Terminal",
  description: "Visualise observed XRP Ledger payment flows around an address. Edges are payments only; ownership is never inferred.",
  robots: { index: true, follow: true },
};

export default function GraphPage() {
  return (
    <>
      <PageHeader title="Entity graph" badge={<TrustBadge kind="BETA" />} description="Map the payment counterparties of an XRPL address from its most recent transactions. Zoom, pan, filter by amount and date, and search nodes." />
      <Suspense fallback={<SkeletonRows rows={6} />}>
        <GraphView />
      </Suspense>
      <Disclaimer short className="mt-6" />
    </>
  );
}
