import { describe, expect, it } from "vitest";
import {
  PLANS,
  aiDailyLimit,
  canAddConnectedAccount,
  canConnectExchange,
  canCreateAlert,
  canUseAdvancedForecast,
  canUseSmartAlerts,
  planOf,
} from "@/lib/entitlements";

describe("entitlements", () => {
  it("prices match the spec (EUR)", () => {
    expect(PLANS.free.priceEurMonthly).toBe(0);
    expect(PLANS.pro.priceEurMonthly).toBe(9.99);
    expect(PLANS.proplus.priceEurMonthly).toBe(19.99);
  });

  it("unknown or missing plans fall back to free (never trust client claims)", () => {
    expect(planOf(undefined).id).toBe("free");
    expect(planOf(null).id).toBe("free");
    expect(planOf("enterprise").id).toBe("free");
  });

  it("connected account limits", () => {
    expect(canAddConnectedAccount("free", 0)).toBe(true);
    expect(canAddConnectedAccount("free", 1)).toBe(false);
    expect(canAddConnectedAccount("pro", 4)).toBe(true);
    expect(canAddConnectedAccount("pro", 5)).toBe(false);
    expect(canAddConnectedAccount("proplus", 10_000)).toBe(true);
  });

  it("alert limits", () => {
    expect(canCreateAlert("free", 4)).toBe(true);
    expect(canCreateAlert("free", 5)).toBe(false);
    expect(canCreateAlert("pro", 49)).toBe(true);
    expect(canCreateAlert("proplus", 250)).toBe(false);
  });

  it("feature gates are monotonic: every higher plan includes lower-plan features and limits", () => {
    const order = [PLANS.free, PLANS.pro, PLANS.proplus];
    for (let i = 1; i < order.length; i++) {
      for (const [k, v] of Object.entries(order[i - 1].features)) {
        if (v) expect(order[i].features[k as keyof typeof order[number]["features"]]).toBe(true);
      }
      for (const [k, v] of Object.entries(order[i - 1].limits)) {
        expect(order[i].limits[k as keyof typeof order[number]["limits"]]).toBeGreaterThanOrEqual(v);
      }
    }
  });

  it("specific feature helpers", () => {
    expect(canUseAdvancedForecast("free")).toBe(false);
    expect(canUseAdvancedForecast("pro")).toBe(true);
    expect(canUseSmartAlerts("pro")).toBe(false);
    expect(canUseSmartAlerts("proplus")).toBe(true);
    expect(canConnectExchange("free")).toBe(false);
    expect(aiDailyLimit("free")).toBeGreaterThan(0);
  });
});
