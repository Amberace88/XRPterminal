"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Registers /sw.js (production only) and shows an offline banner so cached screens are
 * never mistaken for live data (spec §170, §179). Mount once in the root layout: <RegisterSW />.
 */
export function RegisterSW() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
    }
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[95] flex items-center justify-center gap-2 border-b border-warning/40 bg-warning/15 px-3 py-1.5 text-xs font-medium text-warning backdrop-blur">
      <WifiOff className="h-3.5 w-3.5" /> You&apos;re offline — prices, ledger data and alerts are not updating and may be outdated.
    </div>
  );
}
