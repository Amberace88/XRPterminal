"use client";

import { useMemo, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Misc";
import { scanContent } from "@/lib/social/scam";
import { ReportButton } from "./ReportButton";

const TIPS = [
  "No one legitimate — including XRP Terminal, Ripple or exchanges — will ever ask for your seed phrase, secret or private key.",
  "“Send X, get 2X back” giveaways are always scams, even when they show a famous name or logo.",
  "Guaranteed or risk-free returns do not exist. Verified performance here comes only from connected on-chain data.",
  "Screenshots are not verification. Look for the Verified badge backed by an on-chain challenge.",
  "Be wary of anyone moving the conversation to WhatsApp or Telegram.",
];

/** Scam protection (spec §88): deterministic content checker + reporting + safety guidance. */
export function ScamProtection({ className }: { className?: string }) {
  const [text, setText] = useState("");
  const scan = useMemo(() => (text.trim().length > 5 ? scanContent(text) : null), [text]);
  return (
    <Card className={className}>
      <CardHeader title="Scam protection" icon={<ShieldAlert className="h-4 w-4" />} subtitle="Check a message before you act on it" actions={<ReportButton targetType="content" label="Report" />} />
      <CardBody className="space-y-3">
        <Field label="Paste a message, post or DM" htmlFor="scam-check" hint="Checked locally in your browser with fixed rules — nothing is sent.">
          <textarea id="scam-check" className="input min-h-[80px] py-2" value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} placeholder="e.g. “Official Ripple giveaway — send 500 XRP and receive 1000 back!”" />
        </Field>
        {scan &&
          (scan.flagged ? (
            <div className="rounded-lg border border-danger/25 bg-danger/5 p-3 animate-fade-up" role="status">
              <div className="mb-1.5 flex items-center gap-2">
                <Badge tone={scan.severity === "high" ? "danger" : "warning"}>{scan.severity === "high" ? "High risk" : "Suspicious"}</Badge>
                <span className="text-2xs text-fg-muted">{scan.flags.length} pattern(s) matched</span>
              </div>
              <ul className="space-y-1 text-xs text-fg-secondary">
                {scan.flags.map((f) => (
                  <li key={f.code}>
                    <strong className="text-fg">{f.label}</strong> — “{f.match}”
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-fg-muted" role="status">
              <ShieldCheck className="h-3.5 w-3.5 text-success" /> No known scam patterns matched. That does not make it safe — stay cautious.
            </p>
          ))}
        <ul className="space-y-1.5 border-t border-border-subtle pt-3 text-2xs leading-relaxed text-fg-muted">
          {TIPS.map((t) => (
            <li key={t} className="flex gap-1.5">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-fg-muted" />
              {t}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
