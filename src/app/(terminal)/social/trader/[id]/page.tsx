import type { Metadata } from "next";
import { TraderProfile } from "@/components/social/TraderProfile";

export const metadata: Metadata = { title: "Trader profile — XRP Terminal" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TraderProfile id={id} />;
}
