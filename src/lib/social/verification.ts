/**
 * Trader wallet verification (spec §83): the user proves control of an XRPL address by
 * sending a transaction FROM that address (from their own wallet app — we never sign)
 * that carries a Memo containing a one-time challenge code. We then scan `account_tx`.
 * Screenshots are never accepted.
 */

export const CHALLENGE_TTL_MS = 48 * 3_600_000;
const B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid confusion

export function generateChallengeCode(randomBytes?: Uint8Array): string {
  const bytes = randomBytes ?? crypto.getRandomValues(new Uint8Array(10));
  let s = "";
  for (let i = 0; i < 10; i++) s += B32[bytes[i % bytes.length] % B32.length];
  return `XRPT-${s}`;
}

export function utf8ToHex(s: string): string {
  return Array.from(new TextEncoder().encode(s))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export function hexToUtf8(hex: string): string {
  if (!hex || !/^[0-9a-f]*$/i.test(hex) || hex.length % 2) return "";
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

type Json = Record<string, unknown>;

/** account_tx entries differ between API v1 (`tx`) and v2 (`tx_json`). */
export interface AccountTxEntry {
  tx?: Json;
  tx_json?: Json;
  meta?: Json | string;
  validated?: boolean;
  hash?: string;
  ledger_index?: number;
  close_time_iso?: string;
}

export function txOf(e: AccountTxEntry): Json {
  return (e.tx_json ?? e.tx ?? {}) as Json;
}

export function txHash(e: AccountTxEntry): string | undefined {
  return (e.hash ?? (txOf(e).hash as string | undefined)) || undefined;
}

export function txTimeMs(e: AccountTxEntry): number | null {
  const t = txOf(e);
  if (typeof t.date === "number") return (t.date + 946684800) * 1000;
  if (e.close_time_iso) {
    const ms = Date.parse(e.close_time_iso);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

export function memoTexts(tx: Json): string[] {
  const memos = Array.isArray(tx.Memos) ? (tx.Memos as { Memo?: Json }[]) : [];
  const out: string[] = [];
  for (const m of memos) {
    const memo = m?.Memo ?? {};
    for (const k of ["MemoData", "MemoType", "MemoFormat"]) {
      const v = memo[k];
      if (typeof v === "string" && v) {
        out.push(hexToUtf8(v));
        out.push(v);
      }
    }
  }
  return out;
}

export interface ChallengeMatch {
  hash: string;
  ledgerIndex: number | null;
  time: number;
}

/**
 * Find a successful, validated transaction sent FROM `address` whose memo contains `code`,
 * inside [notBefore, notAfter]. Pure function — unit-tested with fixtures.
 */
export function findChallengeTx(
  entries: AccountTxEntry[],
  opts: { address: string; code: string; notBefore: number; notAfter: number },
): ChallengeMatch | null {
  const needle = opts.code.replace(/\s+/g, "").toUpperCase();
  const needleHex = utf8ToHex(opts.code.trim());
  for (const e of entries) {
    const tx = txOf(e);
    if (tx.Account !== opts.address) continue;
    if (e.validated === false) continue;
    const meta = typeof e.meta === "object" && e.meta ? (e.meta as Json) : null;
    if (meta && meta.TransactionResult !== "tesSUCCESS") continue;
    const time = txTimeMs(e);
    if (time === null || time < opts.notBefore || time > opts.notAfter) continue;
    const hit = memoTexts(tx).some((m) => m.replace(/\s+/g, "").toUpperCase().includes(needle) || m.toUpperCase().includes(needleHex));
    if (!hit) continue;
    const hash = txHash(e);
    if (!hash) continue;
    return { hash, ledgerIndex: (e.ledger_index ?? (tx.ledger_index as number | undefined)) ?? null, time };
  }
  return null;
}
