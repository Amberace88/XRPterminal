import type { AiNarrative, AiStatus, DataBrief, IntelSnapshot } from "@/lib/intel/types";

/** Shape returned by GET /api/ai/brief */
export interface BriefApiResponse {
  brief: DataBrief;
  snapshot: IntelSnapshot;
  ai: { status: AiStatus; narrative: AiNarrative | null; message?: string };
  aiConfigured: boolean;
}
