import { Suspense } from "react";
import type { Metadata } from "next";
import { JournalView } from "@/components/tradelab/JournalView";
import { Skeleton } from "@/components/ui/States";

export const metadata: Metadata = { title: "Journal" };

export default function TradeLabJournalPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
      <JournalView />
    </Suspense>
  );
}
