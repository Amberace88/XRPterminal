import type { NewsCluster, NewsEvent, NewsSourceHealth } from "@/lib/news/types";

/** Shape returned by GET /api/news */
export interface NewsApiResponse {
  clusters: NewsCluster[];
  total: number;
  events: NewsEvent[];
  sources: NewsSourceHealth[];
  fetchedAt: number;
  itemCount: number;
  methodology: string;
}

export interface AiStatusResponse {
  ai: boolean;
  supabase: boolean;
  serviceRole: boolean;
  email: boolean;
  telegram: boolean;
  discord: boolean;
}
