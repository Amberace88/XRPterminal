import type { Metadata } from "next";
import { Disclaimer, PageHeader } from "@/components/ui/Misc";
import { AccountView } from "@/components/xrpl/account/AccountView";
import { normalizeXrplAddress } from "@/lib/xrpl/address";

type Props = { params: Promise<{ address: string }>; searchParams: Promise<{ tag?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  let raw = address;
  try {
    raw = decodeURIComponent(address);
  } catch {
    /* keep raw */
  }
  const n = normalizeXrplAddress(raw);
  if (!n.ok) return { title: "XRPL account | XRP Terminal", robots: { index: false } };
  return {
    title: `XRPL account ${n.classic.slice(0, 8)}…${n.classic.slice(-6)} — balance, tokens & activity | XRP Terminal`,
    description: `Public XRP Ledger data for ${n.classic}: XRP balance, reserves, token trust lines, open DEX offers, activity timeline, counterparties and a rule-based wallet profile with explanations.`,
    robots: { index: true, follow: true },
    alternates: { canonical: `/xrpl/account/${n.classic}` },
  };
}

export default async function AccountPage({ params, searchParams }: Props) {
  const { address } = await params;
  const { tag } = await searchParams;
  const t = tag && /^\d{1,10}$/.test(tag) ? Number(tag) : null;
  return (
    <>
      <PageHeader title="Account" description="Public XRP Ledger account data — balances, activity and explainable analytics. Only public blockchain information is shown." />
      <AccountView address={address} tag={t} />
      <Disclaimer short className="mt-6" />
    </>
  );
}
