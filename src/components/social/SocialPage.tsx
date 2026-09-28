"use client";

import { MessagesSquare } from "lucide-react";
import { PageHeader, Disclaimer } from "@/components/ui/Misc";
import { TrustBadge, Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { VerifiedTraders } from "./VerifiedTraders";
import { VerifyWizard } from "./VerifyWizard";
import { HeadlineSentimentCard } from "./HeadlineSentiment";
import { ScamProtection } from "./ScamProtection";

const PLATFORMS = [
  { name: "X (Twitter)", note: "Requires a paid API agreement — not connected." },
  { name: "Reddit", note: "API integration planned." },
  { name: "Telegram / Discord communities", note: "Planned; opt-in public channels only." },
];

export function SocialPage() {
  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Social Intelligence"
        badge={<TrustBadge kind="BETA" />}
        description="Verified traders backed by on-chain proof, headline tone from real news, and scam protection. No invented traders, followers or sentiment — anything not connected says so."
      />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <VerifiedTraders />
          <div className="grid gap-4 md:grid-cols-2">
            <HeadlineSentimentCard />
            <Card>
              <CardHeader title="Community platforms" icon={<MessagesSquare className="h-4 w-4" />} subtitle="Social-media sentiment sources" />
              <CardBody className="space-y-2.5">
                {PLATFORMS.map((p) => (
                  <div key={p.name} className="flex items-start justify-between gap-3 rounded-lg border border-dashed border-border-subtle p-3">
                    <div>
                      <div className="text-xs font-medium text-fg">{p.name}</div>
                      <div className="text-2xs text-fg-muted">{p.note}</div>
                    </div>
                    <Badge tone="neutral">Planned</Badge>
                  </div>
                ))}
                <p className="text-2xs text-fg-muted">Data source not connected. Until then, community sentiment is not estimated — only headline tone from news is shown, and it is never treated as objective truth.</p>
              </CardBody>
            </Card>
          </div>
        </div>
        <aside className="space-y-4 lg:col-span-4">
          <VerifyWizard />
          <ScamProtection />
        </aside>
      </div>
      <Disclaimer short className="mt-6" />
    </div>
  );
}
