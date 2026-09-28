import { Suspense } from "react";
import type { Metadata } from "next";
import { MarketReport } from "@/components/research/MarketReport";
import { Skeleton } from "@/components/ui/States";

export const metadata: Metadata = { title: "Market research report — XRP Terminal" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-4xl rounded-2xl" />}>
      <MarketReport />
    </Suspense>
  );
}
