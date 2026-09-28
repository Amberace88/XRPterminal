import { createHmac } from "node:crypto";
import { ExchangeApiError, type ExchangeAssetBalance, type ExchangeCredentials, type ExchangeProvider, type PermissionCheck } from "./types";

/**
 * Binance read-only connector (SERVER ONLY — node:crypto HMAC).
 * Permission inspection: GET /sapi/v1/account/apiRestrictions (USER_DATA, HMAC-SHA256 signed).
 * Secrets are never logged; errors carry Binance's code/message only.
 */
export const BINANCE_API = "https://api.binance.com";

export interface BinanceApiRestrictions {
  ipRestrict?: boolean;
  createTime?: number;
  enableReading?: boolean;
  enableWithdrawals?: boolean;
  enableInternalTransfer?: boolean;
  enableMargin?: boolean;
  enableFutures?: boolean;
  permitsUniversalTransfer?: boolean;
  enableVanillaOptions?: boolean;
  enableSpotAndMarginTrading?: boolean;
  enablePortfolioMarginTrading?: boolean;
  enableFixApiTrade?: boolean;
  enableFixReadOnly?: boolean;
  tradingAuthorityExpirationTime?: number;
}

/** Any of these true → the key is NOT read-only and is rejected. */
export const FORBIDDEN_PERMISSIONS: { key: keyof BinanceApiRestrictions; label: string }[] = [
  { key: "enableWithdrawals", label: "withdrawals" },
  { key: "enableInternalTransfer", label: "internal transfers" },
  { key: "enableSpotAndMarginTrading", label: "spot & margin trading" },
  { key: "enableFutures", label: "futures trading" },
  { key: "enableMargin", label: "margin loans/transfers" },
  { key: "permitsUniversalTransfer", label: "universal transfer" },
  { key: "enableVanillaOptions", label: "options trading" },
  { key: "enablePortfolioMarginTrading", label: "portfolio margin trading" },
  { key: "enableFixApiTrade", label: "FIX API trading" },
];

export function signQuery(query: string, secret: string): string {
  return createHmac("sha256", secret).update(query).digest("hex");
}

/** Pure permission evaluation — unit-testable. */
export function evaluateBinancePermissions(r: BinanceApiRestrictions): PermissionCheck {
  const reasons: string[] = [];
  for (const f of FORBIDDEN_PERMISSIONS) if (r[f.key] === true) reasons.push(`Key has ${f.label} enabled`);
  if (r.enableReading !== true) reasons.push("Key does not have read permission enabled");
  const permissions: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(r)) if (typeof v === "boolean") permissions[k] = v;
  return { ok: reasons.length === 0, reasons, permissions, ipRestricted: typeof r.ipRestrict === "boolean" ? r.ipRestrict : null };
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function signedGet<T>(path: string, creds: ExchangeCredentials, params: Record<string, string> = {}, fetchImpl: FetchLike = fetch): Promise<T> {
  const q = new URLSearchParams({ ...params, recvWindow: "10000", timestamp: String(Date.now()) }).toString();
  const sig = signQuery(q, creds.apiSecret);
  let res: Response;
  try {
    res = await fetchImpl(`${BINANCE_API}${path}?${q}&signature=${sig}`, {
      headers: { "X-MBX-APIKEY": creds.apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new ExchangeApiError("Could not reach Binance. Try again later.", 503);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const b = (body ?? {}) as { code?: number; msg?: string };
    if (res.status === 451) throw new ExchangeApiError("Binance refused the request from this server's location (HTTP 451).", 451, b.code);
    if (b.code === -2014 || b.code === -2015 || b.code === -1022)
      throw new ExchangeApiError("Binance rejected the API key (invalid key/secret, IP restriction, or missing permission).", 401, b.code);
    throw new ExchangeApiError(`Binance error${b.code ? ` ${b.code}` : ""}: ${b.msg ?? res.statusText}`, res.status >= 500 ? 502 : 400, b.code);
  }
  return body as T;
}

export function binanceProvider(fetchImpl: FetchLike = fetch): ExchangeProvider {
  return {
    id: "binance",
    name: "Binance",
    async checkReadOnly(creds) {
      const r = await signedGet<BinanceApiRestrictions>("/sapi/v1/account/apiRestrictions", creds, {}, fetchImpl);
      return evaluateBinancePermissions(r);
    },
    async getBalances(creds): Promise<ExchangeAssetBalance[]> {
      const r = await signedGet<{ balances?: { asset: string; free: string; locked: string }[] }>("/api/v3/account", creds, { omitZeroBalances: "true" }, fetchImpl);
      return (r.balances ?? [])
        .filter((b) => Number(b.free) > 0 || Number(b.locked) > 0)
        .map((b) => ({ asset: b.asset, free: b.free, locked: b.locked }));
    },
  };
}

export function getExchangeProvider(id: string): ExchangeProvider | null {
  return id === "binance" ? binanceProvider() : null;
}
