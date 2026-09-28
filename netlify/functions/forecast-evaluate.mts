/**
 * Netlify scheduled function — evaluates matured published forecasts at 00:45 UTC.
 */
export default async (_req: Request) => {
  const base = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error(JSON.stringify({ level: "error", msg: "forecast-evaluate: URL or CRON_SECRET missing" }));
    return new Response("not configured", { status: 500 });
  }
  const res = await fetch(`${base}/api/jobs/forecast/evaluate`, {
    method: "POST",
    headers: { "x-cron-secret": secret, "content-type": "application/json" },
    body: "{}",
  });
  const text = await res.text();
  console.log(JSON.stringify({ level: res.ok ? "info" : "error", msg: "forecast-evaluate", status: res.status, body: text.slice(0, 500) }));
  return new Response(text, { status: res.status });
};

export const config = { schedule: "45 0 * * *" };
