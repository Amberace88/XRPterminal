import { describe, expect, it } from "vitest";
import { scanContent } from "@/lib/social/scam";

const codes = (s: string) => scanContent(s).flags.map((f) => f.code);

describe("scam content filter", () => {
  it("flags guaranteed-profit claims", () => {
    expect(codes("Guaranteed profit of 30% every week with my signals")).toContain("GUARANTEED_PROFIT");
    expect(codes("Risk-free trading returns, you can't lose")).toContain("GUARANTEED_PROFIT");
    expect(codes("Earn 50% daily")).toContain("GUARANTEED_PROFIT");
  });
  it("flags seed phrase and private key requests", () => {
    expect(codes("Please send your 12 word recovery phrase to verify")).toContain("SEED_PHRASE_REQUEST");
    expect(codes("DM me your secret key / private key for support")).toContain("PRIVATE_KEY_REQUEST");
    expect(scanContent("enter your seed phrase").severity).toBe("high");
  });
  it("flags deposit requests and giveaway doubling", () => {
    expect(codes("Deposit 500 XRP to this address to join the pool")).toContain("DEPOSIT_REQUEST");
    expect(codes("Send 1000 XRP and receive 2000 back!")).toContain("GIVEAWAY_DOUBLING");
    expect(codes("Pay a fee to unlock your withdrawal")).toContain("DEPOSIT_REQUEST");
  });
  it("flags impersonation and off-platform contact", () => {
    expect(codes("Official Ripple support team here")).toContain("IMPERSONATION");
    expect(codes("Contact me on WhatsApp for signals")).toContain("OFF_PLATFORM_CONTACT");
  });
  it("does not flag ordinary market commentary", () => {
    const r = scanContent("XRP closed above its 50-day average; volatility is elevated. Not financial advice.");
    expect(r.flagged).toBe(false);
    expect(r.severity).toBe("none");
    expect(scanContent("Never share your seed phrase with anyone.").flagged).toBe(true); // mention still flagged for review
  });
});
