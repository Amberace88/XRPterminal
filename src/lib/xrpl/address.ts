import { isValidClassicAddress, isValidXAddress, xAddressToClassicAddress } from "ripple-address-codec";

/** XRPL address validation & normalisation (spec §183). */
export function normalizeXrplAddress(input: string): { ok: true; classic: string; tag?: number | false } | { ok: false; reason: string } {
  const s = (input || "").trim();
  if (!s) return { ok: false, reason: "Address is empty" };
  if (isValidClassicAddress(s)) return { ok: true, classic: s };
  if (isValidXAddress(s)) {
    try {
      const { classicAddress, tag } = xAddressToClassicAddress(s);
      return { ok: true, classic: classicAddress, tag };
    } catch {
      return { ok: false, reason: "Invalid X-address" };
    }
  }
  return { ok: false, reason: "Not a valid XRPL classic address (r…) or X-address" };
}

export const isTxHash = (s: string) => /^[A-Fa-f0-9]{64}$/.test(s.trim());
export const isLedgerIndex = (s: string) => /^\d{1,12}$/.test(s.trim());

export type SearchKind = "account" | "transaction" | "ledger" | "unknown";
export function classifySearch(q: string): SearchKind {
  const s = q.trim();
  if (isTxHash(s)) return "transaction";
  if (isLedgerIndex(s)) return "ledger";
  if (normalizeXrplAddress(s).ok) return "account";
  return "unknown";
}

/** Decode 40-char hex currency codes (non-standard currencies) into readable text. */
export function decodeCurrency(code: string): string {
  if (!code) return "";
  if (code.length === 3) return code;
  if (/^[0-9A-F]{40}$/i.test(code)) {
    if (code.startsWith("03")) return "LP Token";
    let out = "";
    for (let i = 0; i < 40; i += 2) {
      const c = parseInt(code.slice(i, i + 2), 16);
      if (c === 0) continue;
      out += String.fromCharCode(c);
    }
    return /^[\x20-\x7E]+$/.test(out) ? out.trim() : code.slice(0, 8) + "…";
  }
  return code;
}
