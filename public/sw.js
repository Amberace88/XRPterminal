/* XRP Terminal service worker — offline shell (spec §170, §179).
 * - Pages: network-first; the last successfully loaded public page is used when offline.
 * - Static build assets: cache-first (content-hashed, immutable).
 * - /api/*, /auth/*, /admin/*, /settings: NEVER cached — financial and account data must
 *   never be served stale as if it were current.
 */
const VERSION = "xrpt-sw-v1";
const PAGES = `${VERSION}-pages`;
const STATIC = `${VERSION}-static`;
const PRECACHE = ["/icon-192.png", "/brand/mark-128.png"];
const NO_CACHE_PREFIXES = ["/api/", "/auth/", "/admin", "/settings", "/reset-password"];

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · XRP Terminal</title><meta name="theme-color" content="#080a0e">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#080a0e;color:#ecf0f6;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
.c{max-width:440px;text-align:center}img{width:64px;height:64px}h1{font-size:22px;margin:20px 0 8px}p{color:#a0abbc;line-height:1.6;font-size:15px;margin:0 0 12px}
.w{border:1px dashed rgba(245,176,65,.5);background:rgba(245,176,65,.07);color:#f5b041;border-radius:12px;padding:10px 12px;font-size:13px}
button{margin-top:18px;background:#2e9aff;color:#fff;border:0;border-radius:10px;padding:11px 20px;font-size:14px;cursor:pointer}</style></head>
<body><div class="c"><img src="/brand/mark-128.png" alt=""><h1>You're offline</h1>
<p>XRP Terminal can't reach the network right now.</p>
<p class="w">Market prices, ledger data and alerts cannot update while offline. Anything you saw earlier may be outdated — nothing is live until you reconnect.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function offlineResponse() {
  return new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // third-party (exchange feeds, XRPL) — never intercepted
  if (NO_CACHE_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    if (req.mode === "navigate") event.respondWith(fetch(req).catch(() => offlineResponse()));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || offlineResponse())),
    );
    return;
  }

  const isStatic = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/") || /^\/(icon-|favicon|apple-touch-icon)/.test(url.pathname);
  if (isStatic) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy)).catch(() => undefined);
            }
            return res;
          }),
      ),
    );
  }
});
