/**
 * Social scam protection content filter (spec §88). Deterministic pattern rules.
 * Flags: guaranteed-profit claims, deposit/send requests, seed phrase / private key
 * requests, giveaway doubling, impersonation, fake verification/performance claims.
 */

export type ScamFlagCode =
  | "GUARANTEED_PROFIT"
  | "SEED_PHRASE_REQUEST"
  | "PRIVATE_KEY_REQUEST"
  | "DEPOSIT_REQUEST"
  | "GIVEAWAY_DOUBLING"
  | "IMPERSONATION"
  | "FAKE_VERIFICATION"
  | "OFF_PLATFORM_CONTACT";

export interface ScamFlag {
  code: ScamFlagCode;
  label: string;
  severity: "high" | "medium";
  match: string;
}

export interface ScamScanResult {
  flagged: boolean;
  severity: "none" | "medium" | "high";
  flags: ScamFlag[];
}

const RULES: { code: ScamFlagCode; label: string; severity: "high" | "medium"; patterns: RegExp[] }[] = [
  {
    code: "SEED_PHRASE_REQUEST",
    label: "Asks for a seed / recovery phrase",
    severity: "high",
    patterns: [
      /\b(seed|secret|recovery|mnemonic|backup)\s*(phrase|words?|key)\b/i,
      /\b(12|24)[\s-]*(word|words)\b/i,
      /\bfamily\s*seed\b/i,
    ],
  },
  {
    code: "PRIVATE_KEY_REQUEST",
    label: "Requests or exposes a private key / secret",
    severity: "high",
    patterns: [/\bprivate\s*keys?\b/i, /\b(wallet|account)\s*secret\b/i, /\bs[1-9A-HJ-NP-Za-km-z]{28}\b/],
  },
  {
    code: "GUARANTEED_PROFIT",
    label: "Guaranteed / risk-free profit claim",
    severity: "high",
    patterns: [
      /\bguarantee(d|s)?\b[^.!?\n]{0,40}\b(profit|return|gain|income|roi|x)\b/i,
      /\b(profit|return|gain|income|roi)s?\b[^.!?\n]{0,25}\bguarantee(d)?\b/i,
      /\brisk[\s-]*free\b[^.!?\n]{0,30}\b(profit|return|trade|trading|income|investment)/i,
      /\b(no|zero)\s*risk\b/i,
      /\b\d{2,4}\s*%\s*(daily|weekly|per\s*day|a\s*day|per\s*week|monthly)\b/i,
      /\b(can'?t|cannot|never)\s*lose\b/i,
      /\b100\s*%\s*(win|success|accurate|guaranteed)/i,
    ],
  },
  {
    code: "GIVEAWAY_DOUBLING",
    label: "Send-to-receive / giveaway doubling pattern",
    severity: "high",
    patterns: [
      /\bsend\b[^.!?\n]{0,40}\b(get|receive)\b[^.!?\n]{0,30}\b(back|double|2x|twice)\b/i,
      /\b(double|2x|triple|3x)\s*(your|ur)\s*(xrp|crypto|coins?|money|investment)\b/i,
      /\bgiveaway\b[^.!?\n]{0,60}\b(send|deposit)\b/i,
      /\bairdrop\b[^.!?\n]{0,40}\b(connect|verify|validate)\s*(your\s*)?wallet\b/i,
    ],
  },
  {
    code: "DEPOSIT_REQUEST",
    label: "Asks you to deposit or send funds",
    severity: "high",
    patterns: [
      /\b(deposit|send|transfer)\b[^.!?\n]{0,30}\b(xrp|funds|money|crypto|usdt|btc|eth|coins?)\b[^.!?\n]{0,30}\b(to|into)\b[^.!?\n]{0,20}\b(my|this|our|the following)\b/i,
      /\b(minimum|min\.?)\s*deposit\b/i,
      /\bsend\s*(me|us)\b[^.!?\n]{0,20}\b(xrp|funds|money|crypto)\b/i,
      /\bfee\s*to\s*(unlock|release|withdraw)\b/i,
    ],
  },
  {
    code: "IMPERSONATION",
    label: "Possible impersonation of an official account",
    severity: "medium",
    patterns: [
      /\b(official|real)\s*(ripple|xrp\s*terminal|xrpl|coinbase|binance)\s*(support|team|admin|staff|giveaway)\b/i,
      /\b(garlinghouse|schwartz|ripple\s*ceo)\b[^.!?\n]{0,40}\b(giveaway|gift|sending|reward)\b/i,
      /\b(support|admin)\s*team\b[^.!?\n]{0,40}\b(dm|message|whatsapp|telegram)\b/i,
    ],
  },
  {
    code: "FAKE_VERIFICATION",
    label: "Unverifiable verification / performance claim",
    severity: "medium",
    patterns: [
      /\bverified\s*by\s*(xrp\s*terminal|ripple)\b/i,
      /\b(screenshots?|proof)\s*(of|as)\s*(profits?|gains?|returns?)\b/i,
      /\b\d{3,5}\s*%\s*(roi|returns?|profit)\s*(this|last|every|each)\s*(week|month|day)\b/i,
    ],
  },
  {
    code: "OFF_PLATFORM_CONTACT",
    label: "Pushes contact to private channels",
    severity: "medium",
    patterns: [/\b(dm|message|contact|text)\s*(me|us)\s*(on|via|at)\s*(whatsapp|telegram|signal)\b/i, /\bwhatsapp\s*\+?\d{6,}/i, /\bt\.me\/\w+/i],
  },
];

export function scanContent(input: string): ScamScanResult {
  const text = (input ?? "").slice(0, 20_000);
  const flags: ScamFlag[] = [];
  for (const r of RULES) {
    for (const p of r.patterns) {
      const m = text.match(p);
      if (m) {
        flags.push({ code: r.code, label: r.label, severity: r.severity, match: m[0].slice(0, 80) });
        break;
      }
    }
  }
  const severity = flags.some((f) => f.severity === "high") ? "high" : flags.length ? "medium" : "none";
  return { flagged: flags.length > 0, severity, flags };
}

export const REPORT_CATEGORIES = [
  { value: "scam", label: "Scam" },
  { value: "fraud", label: "Fraud" },
  { value: "impersonation", label: "Impersonation" },
  { value: "misinformation", label: "Misinformation" },
  { value: "harassment", label: "Harassment" },
  { value: "spam", label: "Spam" },
  { value: "fake_performance", label: "Fake performance" },
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number]["value"];
