import type { MetadataRoute } from "next";
import { SITE } from "@/lib/config";
import { DISALLOWED_PATHS } from "@/components/marketing/seo";

export default function robots(): MetadataRoute.Robots {
  const base = SITE.url.replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: DISALLOWED_PATHS }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
