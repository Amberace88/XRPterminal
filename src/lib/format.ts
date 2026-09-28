/**
 * Financial number / date formatting (spec §253–256).
 * Pure functions — safe on server and client.
 */

const DASH = "—";

function isNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Decide sensible decimals for a price so small values are not rounded away. */
export function priceDecimals(value: number): number {
  const a = Math.abs(value);
  if (a === 0) return 2;
  if (a >= 1000) return 2;
  if (a >= 1) return 4;
  if (a >= 0.01) return 5;
  if (a >= 0.0001) return 6;
  return 8;
}

export function formatPrice(value: number | null | undefined, currency: string = "USD", decimals?: number): string {
  if (!isNum(value)) return DASH;
  const d = decimals ?? priceDecimals(value);
  const symbol = currencySymbol(currency);
  const s = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d });
  return `${value < 0 ? "-" : ""}${symbol}${s}${symbol ? "" : " " + currency}`;
}

export function currencySymbol(currency: string): string {
  switch (currency) {
    case "USD":
    case "USDT":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "BTC":
      return "₿";
    case "ETH":
      return "Ξ";
    default:
      return "";
  }
}

export function formatMoney(value: number | null | undefined, currency: string = "USD", decimals = 2): string {
  if (!isNum(value)) return DASH;
  const symbol = currencySymbol(currency);
  const s = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${value < 0 ? "-" : ""}${symbol}${s}`;
}

export function formatSignedMoney(value: number | null | undefined, currency: string = "USD", decimals = 2): string {
  if (!isNum(value)) return DASH;
  const s = formatMoney(Math.abs(value), currency, decimals);
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${s}`;
}

export function formatPct(value: number | null | undefined, decimals = 2, signed = true): string {
  if (!isNum(value)) return DASH;
  const s = Math.abs(value).toFixed(decimals);
  const sign = signed ? (value > 0 ? "+" : value < 0 ? "-" : "") : value < 0 ? "-" : "";
  return `${sign}${s}%`;
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (!isNum(value)) return DASH;
  return value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

export function formatCompact(value: number | null | undefined, decimals = 2): string {
  if (!isNum(value)) return DASH;
  const a = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (a >= 1e12) return `${sign}${(a / 1e12).toFixed(decimals)}T`;
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(decimals)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(decimals)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(decimals)}K`;
  return `${sign}${a.toFixed(decimals)}`;
}

export function formatCompactMoney(value: number | null | undefined, currency = "USD", decimals = 2): string {
  if (!isNum(value)) return DASH;
  return `${value < 0 ? "-" : ""}${currencySymbol(currency)}${formatCompact(Math.abs(value), decimals)}`;
}

/** XRP amounts: small values keep precision (up to 6 dp = 1 drop), large values compact. */
export function formatXrp(value: number | null | undefined, opts: { compact?: boolean; suffix?: boolean } = {}): string {
  if (!isNum(value)) return DASH;
  const { compact = false, suffix = true } = opts;
  const a = Math.abs(value);
  let s: string;
  if (compact && a >= 1e5) s = formatCompact(value, 2);
  else if (a >= 1000) s = value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  else if (a >= 1) s = value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  else s = value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return suffix ? `${s} XRP` : s;
}

/** 1 XRP = 1,000,000 drops. Uses integer math on strings to avoid float error. */
export function dropsToXrp(drops: string | number): number {
  const s = String(drops);
  if (!/^-?\d+$/.test(s)) return Number(s) / 1e6;
  const neg = s.startsWith("-");
  const digits = (neg ? s.slice(1) : s).padStart(7, "0");
  const whole = digits.slice(0, -6);
  const frac = digits.slice(-6);
  return Number(`${neg ? "-" : ""}${whole}.${frac}`);
}

export function shortenMiddle(value: string | null | undefined, head = 6, tail = 6): string {
  if (!value) return DASH;
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/* ----------------------------- Dates ----------------------------- */

export function formatDateTime(ts: number | string | Date | null | undefined, timeZone?: string, withTz = true): string {
  if (ts === null || ts === undefined) return DASH;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return DASH;
  const s = d.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    timeZoneName: withTz ? "short" : undefined,
  });
  return s;
}

export function formatDate(ts: number | string | Date | null | undefined, timeZone?: string): string {
  if (ts === null || ts === undefined) return DASH;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit", timeZone });
}

export function formatTime(ts: number | null | undefined, timeZone?: string, seconds = true): string {
  if (!isNum(ts)) return DASH;
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: seconds ? "2-digit" : undefined,
    timeZone,
  });
}

/** "12s ago", "4m ago", "3h ago", "2d ago" */
export function formatAge(ts: number | null | undefined, now: number = Date.now()): string {
  if (!isNum(ts)) return DASH;
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (!isNum(ms)) return DASH;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function formatDays(days: number | null | undefined): string {
  if (!isNum(days)) return DASH;
  if (days < 1) return "<1 day";
  const d = Math.round(days);
  if (d < 60) return `${d} days`;
  if (d < 730) return `${(d / 30.44).toFixed(1)} months`;
  return `${(d / 365.25).toFixed(1)} years`;
}

/** Ripple epoch (2000-01-01) seconds -> UTC ms */
export function rippleTimeToMs(rippleSeconds: number): number {
  return (rippleSeconds + 946684800) * 1000;
}
