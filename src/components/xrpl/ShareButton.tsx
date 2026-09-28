"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** Share the current public page (Web Share API, falls back to copying the link). */
export function ShareButton({ title, size = "sm" }: { title: string; size?: "xs" | "sm" }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href.split("#")[0] : "";
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await navigator.share({ title, url });
        return;
      }
    } catch {
      /* user cancelled or unsupported → copy */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <Button variant="secondary" size={size} onClick={share} aria-label="Share this page">
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Share2 className="h-3.5 w-3.5" />}
      {copied ? "Link copied" : "Share"}
    </Button>
  );
}
