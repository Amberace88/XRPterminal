import { describe, expect, it } from "vitest";
import { postProcessClaim } from "@/lib/intel/claim";

const ev = (url: string, source = "Src") => ({ summary: "Summary.", url, source, date: "2026-09-01" });

describe("claim check post-processing", () => {
  it("drops evidence URLs not present in search results", () => {
    const r = postProcessClaim(
      { classification: "CONFIRMED", reasoning: "x", evidence: [ev("https://a.example/1"), ev("https://fake.example/2")], counter_evidence: [], confidence: "HIGH" },
      "claim",
      ["https://a.example/1", "https://b.example/3"],
    );
    expect(r.evidence.map((e) => e.url)).toEqual(["https://a.example/1"]);
    expect(r.droppedUnverifiedUrls).toBe(1);
    expect(r.classification).toBe("CONFIRMED");
    expect(r.confidence).toBe("MEDIUM"); // capped: single independent source
  });
  it("downgrades to UNVERIFIED when no verified evidence remains", () => {
    const r = postProcessClaim({ classification: "CONFIRMED", evidence: [ev("https://made-up.example/x")], confidence: "HIGH" }, "claim", []);
    expect(r.classification).toBe("UNVERIFIED");
    expect(r.modelClassification).toBe("CONFIRMED");
    expect(r.confidence).toBe("LOW");
    expect(r.adjustments.join(" ")).toMatch(/downgraded/);
  });
  it("never labels INACCURATE without verified counter-evidence", () => {
    const r = postProcessClaim({ classification: "INACCURATE", evidence: [ev("https://a.example/1")], counter_evidence: [], confidence: "MEDIUM" }, "claim", ["https://a.example/1"]);
    expect(r.classification).toBe("UNVERIFIED");
    const ok = postProcessClaim(
      { classification: "INACCURATE", evidence: [], counter_evidence: [ev("https://a.example/1"), ev("https://www.b.example/2/")], confidence: "HIGH" },
      "claim",
      ["https://a.example/1", "https://b.example/2"],
    );
    expect(ok.classification).toBe("INACCURATE");
    expect(ok.counter_evidence).toHaveLength(2);
    expect(ok.confidence).toBe("HIGH");
  });
  it("handles garbage model output safely", () => {
    const r = postProcessClaim(null, " claim ", []);
    expect(r.classification).toBe("UNVERIFIED");
    expect(r.claim).toBe("claim");
    expect(r.evidence).toEqual([]);
  });
});
