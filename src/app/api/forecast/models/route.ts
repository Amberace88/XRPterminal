import { ok } from "@/lib/server/api";
import { MODEL_CHANGELOG, MODEL_REGISTRY, BASELINE_REGISTRY } from "@/lib/forecast/registry";
import { GATING_RULE, GATING_RULE_TEXT } from "@/lib/forecast/horizons";

/** GET /api/forecast/models — model registry, baselines, changelog and gating rule (spec §66, §203, §204). */
export async function GET() {
  return ok({ models: MODEL_REGISTRY, baselines: BASELINE_REGISTRY, changelog: MODEL_CHANGELOG, gating: { rule: GATING_RULE, text: GATING_RULE_TEXT } }, { cacheSeconds: 3600 });
}
