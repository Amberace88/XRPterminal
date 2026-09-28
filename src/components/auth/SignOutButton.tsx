"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/providers/AuthProvider";
import { reportAuthEvent } from "./useAttemptLimiter";

/** Signs out (audited server-side first, while the session is still valid). */
export function SignOutButton({ className, variant = "secondary" }: { className?: string; variant?: "secondary" | "ghost" | "outline" }) {
  const { signOut, user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  return (
    <Button
      variant={variant}
      size="sm"
      className={className}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await reportAuthEvent("logout");
        await signOut();
        router.replace("/");
        router.refresh();
      }}
    >
      <LogOut className="h-3.5 w-3.5" /> Sign out
    </Button>
  );
}
