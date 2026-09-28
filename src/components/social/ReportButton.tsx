"use client";

import { useMemo, useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Misc";
import { apiPost, ApiError } from "@/hooks/useApi";
import { useToast } from "@/components/ui/Toast";
import { REPORT_CATEGORIES, scanContent, type ReportCategory } from "@/lib/social/scam";

/** Report content/traders for moderation (spec §88). */
export function ReportButton({
  targetType,
  targetId,
  label = "Report",
  size = "xs",
  variant = "ghost",
}: {
  targetType: "trader" | "content" | "news" | "wallet" | "other";
  targetId?: string;
  label?: string;
  size?: "xs" | "sm";
  variant?: "ghost" | "secondary" | "outline";
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory>("scam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scan = useMemo(() => (details.length > 8 ? scanContent(details) : null), [details]);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await apiPost("/api/social/report", { targetType, targetId, category, details: details.trim() || undefined });
      toast({ title: "Report submitted", description: "Thank you — moderators will review it.", tone: "success" });
      setOpen(false);
      setDetails("");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Report failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <Flag className="h-3.5 w-3.5" /> {label}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Report"
        description="Reports are reviewed by moderators. False reports may lead to account restrictions."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} loading={busy}>
              Submit report
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-fg-secondary">Category</legend>
            <div className="flex flex-wrap gap-1.5">
              {REPORT_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={category === c.value}
                  onClick={() => setCategory(c.value)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${category === c.value ? "border-accent/50 bg-accent/10 text-fg" : "border-border-subtle text-fg-muted hover:text-fg"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </fieldset>
          <Field label="Details (optional)" htmlFor="report-details" hint="Paste the message or describe what happened. Never include your seed phrase or keys.">
            <textarea id="report-details" className="input min-h-[90px] py-2" maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} />
          </Field>
          {scan?.flagged && (
            <p className="rounded-md border border-danger/25 bg-danger/5 p-2 text-2xs text-danger">Detected: {scan.flags.map((f) => f.label).join(" · ")}</p>
          )}
          {err && <p className="text-xs text-danger" role="alert">{err}</p>}
        </div>
      </Modal>
    </>
  );
}
