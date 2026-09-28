import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/config";
import { AccountsDisabled, AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/PasswordForms";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  const enabled = isSupabaseConfigured();
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your account email and we'll send you a secure reset link."
      footer={
        <Link href="/login" className="text-accent-strong hover:underline">
          Back to sign in
        </Link>
      }
    >
      {enabled ? <ForgotPasswordForm /> : <AccountsDisabled />}
    </AuthShell>
  );
}
