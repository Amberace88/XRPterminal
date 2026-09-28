import type { Metadata } from "next";
import { Disclaimer, PageHeader } from "@/components/ui/Misc";
import { LedgerView } from "@/components/xrpl/LedgerView";

type Props = { params: Promise<{ index: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { index } = await params;
  const ok = /^\d{1,12}$/.test(index);
  return {
    title: ok ? `XRPL ledger #${Number(index).toLocaleString("en-US")} | XRP Terminal` : "XRPL ledger | XRP Terminal",
    description: ok ? `Header, close time and every transaction in XRP Ledger ledger ${index}.` : "XRP Ledger ledger details.",
    robots: { index: ok, follow: true },
  };
}

export default async function LedgerPage({ params }: Props) {
  const { index } = await params;
  return (
    <>
      <PageHeader title="Ledger" description="A validated XRP Ledger version: header and all transactions, read directly from XRPL servers." />
      <LedgerView index={index} />
      <Disclaimer short className="mt-6" />
    </>
  );
}
