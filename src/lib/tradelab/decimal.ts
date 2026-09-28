import DecimalBase from "decimal.js";

/**
 * Decimal constructor dedicated to Trade Lab money math. Isolated clone so
 * global decimal.js config elsewhere can never change simulation results.
 */
export const Dec = DecimalBase.clone({ precision: 40, rounding: DecimalBase.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 40 });
export type Dec = DecimalBase;

/** XRP supports 6 decimals (drops). */
export const QTY_DP = 6;
/** Money & price precision stored in the ledger. */
export const MONEY_DP = 8;

export const D = (v: DecimalBase.Value): Dec => new Dec(v);
export const ZERO = D(0);

/** Round quantity DOWN to XRP drop precision (never create quantity that does not exist). */
export const qtyRound = (v: Dec): Dec => v.toDecimalPlaces(QTY_DP, DecimalBase.ROUND_DOWN);
export const moneyRound = (v: Dec): Dec => v.toDecimalPlaces(MONEY_DP, DecimalBase.ROUND_HALF_UP);
export const s = (v: Dec): string => v.toFixed();
export const n = (v: string | null | undefined | Dec): number => (v === null || v === undefined ? NaN : typeof v === "string" ? Number(v) : v.toNumber());

/** Parse user input into a finite positive decimal, or null. */
export function parsePositive(v: string | number | null | undefined): Dec | null {
  if (v === null || v === undefined || v === "") return null;
  try {
    const d = D(typeof v === "number" ? String(v) : v.trim());
    if (!d.isFinite() || d.lte(0)) return null;
    return d;
  } catch {
    return null;
  }
}
