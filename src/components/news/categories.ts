import type { NewsCategory } from "@/lib/news/types";

export const CATEGORY_LABEL: Record<NewsCategory, string> = {
  MARKET: "Market",
  XRPL: "XRPL",
  RIPPLE: "Ripple",
  REGULATION: "Regulation",
  INSTITUTIONAL: "Institutional",
  PAYMENTS: "Payments",
  RLUSD: "RLUSD",
  EXCHANGES: "Exchanges",
  MACRO: "Macro",
  TECHNOLOGY: "Technology",
  SECURITY: "Security",
  DEVELOPMENT: "Development",
  COMMUNITY: "Community",
};

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
export const CATEGORY_TONE: Record<NewsCategory, Tone> = {
  MARKET: "neutral",
  XRPL: "accent",
  RIPPLE: "accent",
  REGULATION: "warning",
  INSTITUTIONAL: "info",
  PAYMENTS: "info",
  RLUSD: "success",
  EXCHANGES: "neutral",
  MACRO: "neutral",
  TECHNOLOGY: "info",
  SECURITY: "danger",
  DEVELOPMENT: "accent",
  COMMUNITY: "neutral",
};
