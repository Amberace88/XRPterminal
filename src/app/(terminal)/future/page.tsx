import type { Metadata } from "next";
import { FutureView } from "@/components/future/FutureView";
import { horizonByKey } from "@/lib/forecast/horizons";

export const metadata: Metadata = {
  title: "Future Intelligence — scenario ranges",
  description: "XRP scenario ranges (BEAR / BASE / BULL / EXTREME) with uncertainty, immutable forecast history and walk-forward benchmarks. Scenario ranges, not predictions.",
};

export default async function FuturePage({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  const { h } = await searchParams;
  const initial = (h && horizonByKey(h)?.key) || "30D";
  return <FutureView initialHorizon={initial} />;
}
