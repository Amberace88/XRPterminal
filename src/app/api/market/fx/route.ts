import { getFxRates } from "@/lib/providers/market/snapshot";
import { fail, ok } from "@/lib/server/api";

export async function GET() {
  try {
    return ok(await getFxRates(), { cacheSeconds: 3600 });
  } catch (e) {
    return fail("FX_UNAVAILABLE", e instanceof Error ? e.message : "FX rates unavailable", 503, true);
  }
}
