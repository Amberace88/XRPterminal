"use client";

/** Read design tokens at runtime so charts follow dark/light theme (spec §9). */
export function tokenColor(name: string, alpha = 1): string {
  if (typeof window === "undefined") return `rgba(128,128,128,${alpha})`;
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  if (!v) return `rgba(128,128,128,${alpha})`;
  const [r, g, b] = v.split(/\s+/).map(Number);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function chartPalette() {
  return {
    text: tokenColor("text-muted"),
    textSecondary: tokenColor("text-secondary"),
    grid: tokenColor("border-subtle", 0.6),
    border: tokenColor("border"),
    accent: tokenColor("accent"),
    accentSoft: tokenColor("accent", 0.15),
    accentStrong: tokenColor("accent-strong"),
    up: tokenColor("success"),
    down: tokenColor("danger"),
    warning: tokenColor("warning"),
    info: tokenColor("info"),
    surface: tokenColor("surface"),
    muted: tokenColor("text-muted", 0.6),
  };
}

/** Categorical series colors — accent first, then distinguishable hues. */
export const SERIES = ["accent", "warning", "success", "info", "danger", "text-secondary"] as const;
export const seriesColor = (i: number, alpha = 1) => tokenColor(SERIES[i % SERIES.length], alpha);
