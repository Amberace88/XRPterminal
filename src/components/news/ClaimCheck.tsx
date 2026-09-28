"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircleCheck, CircleHelp, CircleX, ExternalLink, ScanSearch, Info } from "lucide-react";
import { PageHeader, Disclaimer } from "@/components/ui/Misc";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ErrorState, NotConnected, Skeleton } from "@/components/ui/States";
import { Field } from "@/components/ui/Misc";
import { useApi, apiPost, ApiError } from "@/hooks/useApi";
import { formatDateTime } from "@/lib/format";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { CLASSIFICATION_HELP, type ClaimCheckResult, type ClaimClassification, type ClaimEvidence } from "@/lib/intel/claim";
import type { AiStatusResponse } from "./types";

const CLASS_TONE: Record<ClaimClassification, "success" | "info" | "warning" | "danger" | "neutral" | "accent"> = {
  CONFIRMED: "success",
  DOCUMENTED: "success",
  "PARTIALLY SUPPORTED": "info",
  ANALYSIS: "accent",
  SPECULATIVE: "warning",
  UNVERIFIED: "neutral",
  OUTDATED: "warning",
  INACCURATE: "danger",
};

const EXAMPLES = [
  "RLUSD is issued on both the XRP Ledger and Ethereum.",
  "The SEC dropped its appeal in the Ripple case.",
  "XRP will reach $10 by the end of the year.",
];

function hostOf(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return u;
  }
}

function EvidenceList({ items, kind }: { items: ClaimEvidence[]; kind: "supporting" | "counter" }) {
  if (!items.length) return <p className="text-xs text-fg-muted">{kind === "supporting" ? "No verified supporting evidence." : "No verified counter-evidence."}</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((e, i) => (
        <li key={i} className="rounded-lg border border-border-subtle p-3">
          <p className="text-xs leading-relaxed text-fg-secondary">{e.summary}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-fg-muted">
            <a href={e.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-accent-strong hover:underline">
              {e.source || hostOf(e.url)} <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            </a>
            <span>· {e.date ?? "date not shown by source"}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ClaimCheck() {
  const status = useApi<AiStatusResponse>("/api/ai/status", { staleMs: 10 * 60_000 });
  const { tz } = usePreferences();
  const [claim, setClaim] = useState("");
  const [domains, setDomains] = useState("");
  const [result, setResult] = useState<ClaimCheckResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (claim.trim().length < 10) return setErr("Paste a claim of at least 10 characters.");
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const allowedDomains = domains
        .split(/[\s,]+/)
        .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
        .filter(Boolean);
      setResult(await apiPost<ClaimCheckResult>("/api/ai/claim-check", { claim: claim.trim(), ...(allowedDomains.length ? { allowedDomains } : {}) }));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Claim Check failed");
    } finally {
      setBusy(false);
    }
  };

  const aiOff = status.data && !status.data.ai;

  return (
    <div className="animate-fade-up">
      <Link href="/news" className="mb-3 inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> News
      </Link>
      <PageHeader
        title="Claim Check"
        description="Paste a claim about XRP, the XRP Ledger, Ripple or RLUSD. We search the web, keep only evidence whose links came back from the search, and classify the claim with reasoning."
      />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <Card>
            <CardHeader title="Claim" icon={<ScanSearch className="h-4 w-4" />} />
            <CardBody>
              {status.loading && !status.data ? (
                <Skeleton className="h-32 w-full" />
              ) : aiOff ? (
                <NotConnected
                  what="Claim Check needs an AI provider with web search. It is not connected on this deployment."
                  how="An administrator can enable it by setting ANTHROPIC_API_KEY on the server. Until then, check claims against the linked publishers on the News page."
                />
              ) : (
                <form onSubmit={submit} className="space-y-3">
                  <Field label="Claim to check" htmlFor="claim" hint={`${claim.length}/600 · treated as untrusted text`}>
                    <textarea
                      id="claim"
                      className="input min-h-[110px] resize-y py-2"
                      maxLength={600}
                      value={claim}
                      onChange={(e) => setClaim(e.target.value)}
                      placeholder="e.g. “Ripple’s RLUSD is available on the XRP Ledger.”"
                    />
                  </Field>
                  <div className="flex flex-wrap gap-1.5">
                    {EXAMPLES.map((x) => (
                      <button key={x} type="button" onClick={() => setClaim(x)} className="rounded-md border border-border-subtle px-2 py-0.5 text-2xs text-fg-muted hover:border-border hover:text-fg">
                        {x}
                      </button>
                    ))}
                  </div>
                  <Field label="Limit search to domains (optional)" htmlFor="domains" hint="Comma-separated, e.g. sec.gov, ripple.com, xrpl.org">
                    <input id="domains" className="input" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="sec.gov, ripple.com" />
                  </Field>
                  {err && <p className="text-xs text-danger" role="alert">{err}</p>}
                  <Button type="submit" loading={busy} disabled={busy}>
                    <ScanSearch className="h-4 w-4" /> Check claim
                  </Button>
                  {busy && <p className="text-2xs text-fg-muted">Searching and verifying sources — this can take up to a minute.</p>}
                </form>
              )}
            </CardBody>
          </Card>

          {busy && (
            <Card>
              <CardBody className="space-y-3 pt-5">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-24 w-full" />
              </CardBody>
            </Card>
          )}

          {result && (
            <Card className="animate-fade-up">
              <CardHeader title="Result" subtitle={`Checked ${formatDateTime(result.checkedAt, tz)}`} />
              <CardBody className="space-y-4">
                <blockquote className="border-l-2 border-accent/50 pl-3 text-sm italic text-fg-secondary">“{result.claim}”</blockquote>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={CLASS_TONE[result.classification]} className="px-2 py-1 text-xs">
                    {result.classification === "CONFIRMED" || result.classification === "DOCUMENTED" ? (
                      <CircleCheck className="h-3.5 w-3.5" />
                    ) : result.classification === "INACCURATE" ? (
                      <CircleX className="h-3.5 w-3.5" />
                    ) : (
                      <CircleHelp className="h-3.5 w-3.5" />
                    )}
                    {result.classification}
                  </Badge>
                  <Badge tone="neutral" className="py-1">
                    Data confidence: {result.confidence}
                  </Badge>
                </div>
                <p className="text-2xs text-fg-muted">{CLASSIFICATION_HELP[result.classification]} Confidence reflects source quality and availability — not the probability that the claim is true.</p>
                <section>
                  <h4 className="label mb-1.5">Reasoning</h4>
                  <p className="text-sm leading-relaxed text-fg-secondary">{result.reasoning}</p>
                </section>
                {result.context && (
                  <section>
                    <h4 className="label mb-1.5">Context</h4>
                    <p className="text-sm leading-relaxed text-fg-secondary">{result.context}</p>
                  </section>
                )}
                {result.adjustments.length > 0 && (
                  <div className="rounded-lg border border-warning/25 bg-warning/5 p-3 text-2xs text-fg-secondary">
                    <div className="mb-1 flex items-center gap-1.5 font-semibold text-warning">
                      <Info className="h-3 w-3" /> Verification adjustments (applied in code)
                    </div>
                    <ul className="list-disc space-y-0.5 pl-4">
                      {result.adjustments.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardBody>
              <CardFooter>
                <span>
                  {result.searchResultCount} search results · model {result.model ?? "—"}
                </span>
                <span>AI-assisted · verify before relying on it</span>
              </CardFooter>
            </Card>
          )}
          {status.error && !status.data && <ErrorState compact message={status.error.message} onRetry={status.reload} />}
        </div>

        <div className="space-y-4 lg:col-span-5">
          <Card>
            <CardHeader title="Sources — evidence" subtitle="Only links returned by the web search are kept" />
            <CardBody>{result ? <EvidenceList items={result.evidence} kind="supporting" /> : <p className="text-xs text-fg-muted">Evidence appears here after a check.</p>}</CardBody>
          </Card>
          <Card>
            <CardHeader title="Counter-evidence" subtitle="Required before anything is labelled INACCURATE" />
            <CardBody>{result ? <EvidenceList items={result.counter_evidence} kind="counter" /> : <p className="text-xs text-fg-muted">—</p>}</CardBody>
          </Card>
          <Card>
            <CardHeader title="Classifications" />
            <CardBody>
              <dl className="space-y-1.5 text-2xs">
                {(Object.keys(CLASSIFICATION_HELP) as ClaimClassification[]).map((k) => (
                  <div key={k} className="flex gap-2">
                    <dt className="w-32 shrink-0">
                      <Badge tone={CLASS_TONE[k]}>{k}</Badge>
                    </dt>
                    <dd className="text-fg-muted">{CLASSIFICATION_HELP[k]}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>
      <Disclaimer short className="mt-6" />
    </div>
  );
}
