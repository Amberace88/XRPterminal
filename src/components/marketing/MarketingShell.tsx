"use client";

import { MarketingMotion } from "./motion";
import { ReferralCapture } from "./ReferralCapture";

/** Client wrapper for the public site: motion features (LazyMotion) + referral capture. */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <MarketingMotion>
      <ReferralCapture />
      {children}
    </MarketingMotion>
  );
}
