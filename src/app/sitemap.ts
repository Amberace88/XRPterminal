import type { MetadataRoute } from "next";
import { SITE } from "@/lib/config";
import { ACADEMY_MODULES } from "@/lib/academy/content";
import { PUBLIC_PATHS } from "@/components/marketing/seo";

/** Public, indexable pages only (spec §167). Private terminal pages are excluded. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE.url.replace(/\/$/, "");
  const lastModified = new Date();
  return [
    ...PUBLIC_PATHS.map((p) => ({ url: p.path === "/" ? base : `${base}${p.path}`, lastModified, changeFrequency: p.changeFrequency, priority: p.priority })),
    ...ACADEMY_MODULES.map((m) => ({ url: `${base}/academy/${m.slug}`, lastModified, changeFrequency: "monthly" as const, priority: 0.6 })),
  ];
}
