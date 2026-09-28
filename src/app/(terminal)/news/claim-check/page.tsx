import type { Metadata } from "next";
import { ClaimCheck } from "@/components/news/ClaimCheck";

export const metadata: Metadata = { title: "Claim Check — XRP Terminal", description: "Check claims about XRP, the XRP Ledger, Ripple and RLUSD against real, linked sources." };

export default function Page() {
  return <ClaimCheck />;
}
