"use client";

import { useState } from "react";
import { Download, FileJson, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { apiGet } from "@/hooks/useApi";
import { exportAllLocal } from "@/lib/storage/local";
import { downloadFile, toLongCsv } from "./exportCsv";
import { SettingRow, SettingsSection } from "./SettingsSection";

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

/** GDPR data access/portability (spec §193, §195): guest data + account data, JSON or CSV. */
export function DataExportSection() {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<"json" | "csv" | null>(null);

  const exportLocal = (fmt: "json" | "csv") => {
    const data = exportAllLocal();
    // never export transient auth-limiter state
    for (const k of Object.keys(data)) if (k.startsWith("auth-limit:")) delete data[k];
    const payload = { exportedAt: new Date().toISOString(), format: "xrp-terminal-browser-export/v1", data };
    if (fmt === "json") downloadFile(`xrp-terminal-browser-data-${stamp()}.json`, JSON.stringify(payload, null, 2), "application/json");
    else downloadFile(`xrp-terminal-browser-data-${stamp()}.csv`, toLongCsv(data), "text/csv");
  };

  const exportAccount = async (fmt: "json" | "csv") => {
    setBusy(fmt);
    try {
      const d = await apiGet<{ tables: Record<string, unknown[]>; profile: unknown; account: unknown }>("/api/user/export");
      if (fmt === "json") downloadFile(`xrp-terminal-account-${stamp()}.json`, JSON.stringify(d, null, 2), "application/json");
      else downloadFile(`xrp-terminal-account-${stamp()}.csv`, toLongCsv({ account: d.account, profile: d.profile, ...d.tables }), "text/csv");
      toast({ title: "Export ready", description: "Your account data was downloaded.", tone: "success" });
    } catch (e) {
      toast({ title: "Export failed", description: e instanceof Error ? e.message : "Please try again.", tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsSection id="export" title="Data export" description="Download a copy of your data. JSON keeps the full structure; CSV lists one value per row (dataset, record, field, value).">
      <div className="space-y-1">
        <SettingRow label="Browser data" description="Preferences and guest-mode data stored in this browser: watchlists, tracked wallets, alerts, paper trades, journal.">
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => exportLocal("json")}>
              <FileJson className="h-3.5 w-3.5" /> JSON
            </Button>
            <Button size="sm" variant="secondary" onClick={() => exportLocal("csv")}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </SettingRow>
        <SettingRow
          label="Account data"
          description={user ? "Everything linked to your account on our servers. Secret values such as exchange API credentials are never exported." : "Available when you're signed in."}
        >
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={!user} loading={busy === "json"} onClick={() => exportAccount("json")}>
              {busy !== "json" && <Download className="h-3.5 w-3.5" />} JSON
            </Button>
            <Button size="sm" variant="secondary" disabled={!user} loading={busy === "csv"} onClick={() => exportAccount("csv")}>
              {busy !== "csv" && <Download className="h-3.5 w-3.5" />} CSV
            </Button>
          </div>
        </SettingRow>
      </div>
    </SettingsSection>
  );
}
