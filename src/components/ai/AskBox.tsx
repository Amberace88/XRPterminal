"use client";

import { useState } from "react";
import { ExternalLink, MessageSquare, Send } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ClaimLabel } from "@/components/ui/Misc";
import { Badge } from "@/components/ui/Badge";
import { NotConnected } from "@/components/ui/States";
import { apiPost, ApiError } from "@/hooks/useApi";
import { useAuth } from "@/components/providers/AuthProvider";
import { aiDailyLimit } from "@/lib/entitlements";

interface Answer {
  answer: string;
  facts: string[];
  analysis: string[];
  unanswerable: boolean;
  sources: { title: string; url: string }[];
  usedWebSearch: boolean;
  webSearchAllowed: boolean;
  model: string;
  snapshotAsOf: number;
}

const SUGGESTIONS = ["What changed in the last 24 hours?", "Is volatility high relative to history?", "How correlated is XRP with BTC right now?", "What are the main risks today?"];

/** "Ask XRP Terminal" — answers only from the structured snapshot (+ optional web search on paid plans). */
export function AskBox({ aiConfigured }: { aiConfigured: boolean | null }) {
  const { plan } = useAuth();
  const [q, setQ] = useState("");
  const [web, setWeb] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [a, setA] = useState<Answer | null>(null);
  const paid = plan === "pro" || plan === "proplus";

  const ask = async (text = q) => {
    if (text.trim().length < 3) return;
    setBusy(true);
    setErr(null);
    try {
      setA(await apiPost<Answer>("/api/ai/ask", { question: text.trim(), webSearch: web && paid }));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Ask XRP Terminal" icon={<MessageSquare className="h-4 w-4" />} subtitle={`Answers from today's structured snapshot · ${aiDailyLimit(plan)} questions/day on your plan`} />
      <CardBody>
        {aiConfigured === false ? (
          <NotConnected what="AI provider not connected — questions can't be answered on this deployment." className="py-6" />
        ) : (
          <div className="space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask();
              }}
              className="flex gap-2"
            >
              <label htmlFor="ask" className="sr-only">
                Question
              </label>
              <input id="ask" className="input flex-1" maxLength={500} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about price, regime, volatility, news…" />
              <Button type="submit" loading={busy} disabled={busy || q.trim().length < 3} aria-label="Ask">
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setQ(s);
                    ask(s);
                  }}
                  className="rounded-md border border-border-subtle px-2 py-0.5 text-2xs text-fg-muted hover:border-border hover:text-fg"
                >
                  {s}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-2xs text-fg-muted">
              <input type="checkbox" checked={web && paid} disabled={!paid} onChange={(e) => setWeb(e.target.checked)} className="accent-[rgb(var(--accent))]" />
              Include web search {paid ? "" : "(Pro / Pro+)"}
            </label>
            {err && <p className="text-xs text-danger" role="alert">{err}</p>}
            {a && (
              <div className="space-y-3 rounded-lg border border-border-subtle bg-bg-secondary/40 p-3 animate-fade-up">
                {a.unanswerable && <Badge tone="warning">Not answerable from available data</Badge>}
                <p className="text-sm leading-relaxed text-fg">{a.answer}</p>
                {a.facts.map((f, i) => (
                  <p key={`f${i}`} className="flex gap-2 text-xs text-fg-secondary">
                    <ClaimLabel kind="FACT" /> {f}
                  </p>
                ))}
                {a.analysis.map((f, i) => (
                  <p key={`a${i}`} className="flex gap-2 text-xs text-fg-secondary">
                    <ClaimLabel kind="ANALYSIS" /> {f}
                  </p>
                ))}
                {a.sources.length > 0 && (
                  <ul className="space-y-0.5 border-t border-border-subtle pt-2">
                    {a.sources.map((s) => (
                      <li key={s.url} className="text-2xs">
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-strong hover:underline">
                          {s.title} <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-2xs text-fg-muted">
                  {a.model}
                  {a.usedWebSearch ? " · with web search" : " · snapshot only"} · AI can be wrong; numbers come from the snapshot. Not investment advice.
                </p>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
