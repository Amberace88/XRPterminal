import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, keyFingerprint, parseEncryptionKey } from "@/lib/portfolio/crypto";
import { evaluateBinancePermissions, signQuery } from "@/lib/exchanges/binance";

const KEY_HEX = randomBytes(32).toString("hex");
const KEY_B64 = randomBytes(32).toString("base64");

describe("AES-256-GCM credential encryption", () => {
  it("round-trips with hex and base64 keys, random IV per call", () => {
    const a = encryptSecret("my-api-secret", KEY_HEX, "user:binance");
    const b = encryptSecret("my-api-secret", KEY_HEX, "user:binance");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(a).not.toContain("my-api-secret");
    expect(decryptSecret(a, KEY_HEX, "user:binance")).toBe("my-api-secret");
    expect(decryptSecret(encryptSecret("x", KEY_B64), KEY_B64)).toBe("x");
  });
  it("fails with the wrong key, wrong AAD or tampered payload", () => {
    const p = encryptSecret("secret", KEY_HEX, "u1:binance");
    expect(() => decryptSecret(p, randomBytes(32).toString("hex"), "u1:binance")).toThrow();
    expect(() => decryptSecret(p, KEY_HEX, "u2:binance")).toThrow();
    const parts = p.split(".");
    const ct = Buffer.from(parts[3], "base64");
    ct[0] ^= 0xff;
    expect(() => decryptSecret([parts[0], parts[1], parts[2], ct.toString("base64")].join("."), KEY_HEX, "u1:binance")).toThrow();
  });
  it("rejects weak / malformed keys", () => {
    expect(() => parseEncryptionKey("")).toThrow();
    expect(() => parseEncryptionKey("short")).toThrow();
    expect(parseEncryptionKey(KEY_HEX)).toHaveLength(32);
  });
  it("fingerprints are stable and do not reveal the key", () => {
    const k = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
    expect(keyFingerprint(k)).toBe(keyFingerprint(k));
    expect(keyFingerprint(k)).not.toContain(k.slice(0, 10));
  });
});

describe("Binance read-only permission check", () => {
  it("accepts reading-only keys", () => {
    const r = evaluateBinancePermissions({ ipRestrict: true, enableReading: true, enableWithdrawals: false, enableInternalTransfer: false, enableSpotAndMarginTrading: false, enableFutures: false });
    expect(r.ok).toBe(true);
    expect(r.ipRestricted).toBe(true);
  });
  it.each(["enableWithdrawals", "enableInternalTransfer", "enableSpotAndMarginTrading", "enableFutures"] as const)("rejects %s", (k) => {
    const r = evaluateBinancePermissions({ enableReading: true, [k]: true });
    expect(r.ok).toBe(false);
    expect(r.reasons.length).toBe(1);
  });
  it("rejects keys without read permission", () => {
    expect(evaluateBinancePermissions({ enableReading: false }).ok).toBe(false);
  });
  it("signs queries with HMAC-SHA256 (Binance docs example)", () => {
    // Example from Binance API docs (SIGNED endpoint security)
    const q = "symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559";
    const secret = "NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j";
    expect(signQuery(q, secret)).toBe("c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71");
  });
});
