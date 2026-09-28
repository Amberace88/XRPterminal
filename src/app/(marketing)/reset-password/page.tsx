import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/config";
import { AccountsDisabled, AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/PasswordForms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  const enabled = isSupabaseConfigured();
  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 10 characters with letters and numbers.">
      {enabled ? <ResetPasswordForm /> : <AccountsDisabled />}
    </AuthShell>
  );
}
