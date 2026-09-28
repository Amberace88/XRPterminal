/**
 * Guards against users pasting secrets where a public address is expected (spec §40: no private key,
 * no seed phrase, no signing). Used client-side (instant warning) and server-side (rejection).
 */
export function looksLikeSecret(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  // family seed (s…), mnemonic (12+ words), raw 32-byte hex private key (optionally ED-prefixed)
  return /^s[1-9A-HJ-NP-Za-km-z]{20,40}$/.test(t) || t.split(/\s+/).length >= 12 || /^(ED|00)?[0-9A-F]{64}$/i.test(t);
}

export const SECRET_WARNING =
  "That looks like a secret key or seed phrase. Never share it with anyone — XRP Terminal only needs your public address (starts with r).";
