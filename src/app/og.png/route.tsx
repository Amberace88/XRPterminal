import { ImageResponse } from "next/og";

export const dynamic = "force-static";

/**
 * Open Graph card (1200×630) served at /og.png — referenced by the root layout metadata.
 * Purely typographic/CSS so it renders at build time without fetching assets.
 * (Hex colours are required here: OG images are rendered outside the CSS token system.)
 */
export function GET() {
  const bars = [0.28, 0.42, 0.36, 0.55, 0.5, 0.68, 0.62, 0.8];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#080a0e", fontFamily: "sans-serif", overflow: "hidden" }}>
        {/* grid */}
        {Array.from({ length: 13 }).map((_, i) => (
          <div key={`v${i}`} style={{ position: "absolute", top: 0, bottom: 0, left: i * 100, width: 1, background: "rgba(38,45,58,0.45)" }} />
        ))}
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={`h${i}`} style={{ position: "absolute", left: 0, right: 0, top: i * 100 + 15, height: 1, background: "rgba(38,45,58,0.45)" }} />
        ))}
        {/* glow */}
        <div style={{ position: "absolute", width: 900, height: 900, left: 520, top: -360, borderRadius: 9999, background: "radial-gradient(circle, rgba(46,154,255,0.28), rgba(46,154,255,0) 65%)" }} />
        {/* abstract chart (decorative) */}
        <div style={{ position: "absolute", right: 90, bottom: 110, display: "flex", alignItems: "flex-end", gap: 18 }}>
          {bars.map((h, i) => (
            <div key={i} style={{ width: 26, height: 300 * h, borderRadius: 6, background: i === bars.length - 1 ? "#5ec4ff" : "rgba(46,154,255,0.45)" }} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", width: "100%", height: "100%", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 10, height: 44, borderRadius: 4, background: "#2e9aff" }} />
            <div style={{ display: "flex", fontSize: 28, fontWeight: 800, letterSpacing: 8, color: "#ecf0f6" }}>
              XRP<span style={{ marginLeft: 12, fontWeight: 500, color: "#a0abbc" }}>TERMINAL</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 104, fontWeight: 800, letterSpacing: -4, lineHeight: 1, color: "#ecf0f6" }}>SEE BEYOND</div>
            <div style={{ fontSize: 104, fontWeight: 800, letterSpacing: -4, lineHeight: 1.05, color: "#5ec4ff" }}>THE PRICE.</div>
            <div style={{ marginTop: 28, fontSize: 28, color: "#a0abbc", maxWidth: 720 }}>Independent XRP & XRP Ledger intelligence — real data, visible sources, no custody.</div>
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#687385" }}>xrpterminal.com · Not affiliated with Ripple Labs Inc.</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } },
  );
}
