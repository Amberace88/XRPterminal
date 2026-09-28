/**
 * Netlify scheduled function — evaluates server-side alert rules every 5 minutes by calling
 * our API route with the cron secret (spec §151). The route does all the work.
 */
export default async function alertsCheck(): Promise<Response> {
  const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) return new Response("alerts-check: URL or CRON_SECRET missing", { status: 200 });
  try {
    const res = await fetch(`${base}/api/jobs/alerts/check`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(55_000),
    });
    const body = await res.text();
    return new Response(`alerts-check ${res.status}: ${body.slice(0, 500)}`, { status: 200 });
  } catch (e) {
    return new Response(`alerts-check failed: ${e instanceof Error ? e.message : String(e)}`, { status: 200 });
  }
}

export const config = { schedule: "*/5 * * * *" };
