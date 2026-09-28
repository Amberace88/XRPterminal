import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsView } from "@/components/settings/SettingsView";
import { SkeletonRows } from "@/components/ui/States";

export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };

export default function SettingsPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <SettingsView />
    </Suspense>
  );
}
