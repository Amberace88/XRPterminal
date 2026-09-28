/** SEO route lists shared by sitemap.ts, robots.ts and tests. */
export const PUBLIC_PATHS: { path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
  { path: "/security", priority: 0.6, changeFrequency: "monthly" },
  { path: "/academy", priority: 0.8, changeFrequency: "monthly" },
  { path: "/signup", priority: 0.5, changeFrequency: "yearly" },
  { path: "/legal/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/risk", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/cookies", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/disclaimer", priority: 0.2, changeFrequency: "yearly" },
];

/** Private dashboard, account areas and API must not be indexed (spec §167). */
export const DISALLOWED_PATHS = ["/dashboard", "/portfolio", "/settings", "/admin", "/alerts", "/trade-lab", "/api/", "/auth/", "/reset-password", "/forgot-password"];
