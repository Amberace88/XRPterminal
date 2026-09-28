import type { Metadata } from "next";
import Link from "next/link";
import { Disclaimer, PageHeader } from "@/components/ui/Misc";
import { TxDetail } from "@/components/xrpl/TxDetail";
import { isTxHash } from "@/lib/xrpl/address";

type Props = { params: Promise<{ hash: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hash } = await params;
  const h = hash.toUpperCase();
  const valid = isTxHash(h);
  return {
    title: valid ? `XRPL transaction ${h.slice(0, 10)}…${h.slice(-6)} | XRP Terminal` : "XRPL transaction | XRP Terminal",
    description: valid
      ? `Status, delivered amount, fee, ledger, time and every affected ledger object for XRP Ledger transaction ${h}.`
      : "XRP Ledger transaction details.",
    robots: { index: valid, follow: true },
  };
}

export default async function TxPage({ params }: Props) {
  const { hash } = await params;
  return (
    <>
      <PageHeader
        title="Transaction"
        description={
          <>
            Read directly from the XRP Ledger. <Link href="/xrpl" className="text-accent hover:underline">Back to explorer</Link>
          </>
        }
      />
      <TxDetail hash={hash} />
      <Disclaimer short className="mt-6" />
    </>
  );
}
