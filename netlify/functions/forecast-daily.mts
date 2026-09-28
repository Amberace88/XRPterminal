/**
 * Netlify scheduled function — publishes the daily immutable forecasts at 00:15 UTC
 * (after the UTC daily candle closes). Calls our API route with the cron secret.
 */
export default async (_req: Request) => {
  const base = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error(JSON.stringify({ level: "error", msg: "forecast-daily: URL or CRON_SECRET missing" }));
    return new Response("not configured", { status: 500 });
  }
  const res = await fetch(`${base}/api/jobs/forecast/publish`, {
    method: "POST",
    headers: { "x-cron-secret": secret, "content-type": "application/json" },
    body: "{}",
  });
  const text = await res.text();
  console.log(JSON.stringify({ level: res.ok ? "info" : "error", msg: "forecast-daily", status: res.status, body: text.slice(0, 500) }));
  return new Response(text, { status: res.status });
};

export const config = { schedule: "15 0 * * *" };
