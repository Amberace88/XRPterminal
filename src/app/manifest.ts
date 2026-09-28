import type { MetadataRoute } from "next";

/** Installable PWA manifest (spec §170). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "XRP Terminal",
    short_name: "XRP Terminal",
    description: "Independent XRP & XRP Ledger intelligence. See beyond the price.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#080a0e",
    theme_color: "#080a0e",
    categories: ["finance", "education", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
    shortcuts: [
      { name: "Dashboard", url: "/dashboard" },
      { name: "Market", url: "/market" },
      { name: "XRPL Explorer", url: "/xrpl" },
      { name: "Trade Lab (simulated)", url: "/trade-lab" },
    ],
  };
}
