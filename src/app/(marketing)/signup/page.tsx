import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { isSupabaseConfigured } from "@/lib/config";
import { AccountsDisabled, AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";
import { parseAuthProviders } from "@/components/auth/providers";
import { Skeleton } from "@/components/ui/States";

export const metadata: Metadata = {
  title: "Create your free account",
  description: "Create a free XRP Terminal account: live XRP market data, XRPL explorer, portfolio tracking, scenario ranges and a simulated Trade Lab. No card required.",
  alternates: { canonical: "/signup" },
};

export default function SignupPage() {
  const enabled = isSupabaseConfigured();
  return (
    <AuthShell
      title="Create your free account"
      subtitle="No card required. Non-custodial — we never ask for keys."
      footer={
        enabled ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-accent-strong hover:underline">
              Sign in
            </Link>
          </>
        ) : undefined
      }
    >
      {enabled ? (
        <Suspense fallback={<Skeleton className="h-80 w-full" />}>
          <SignupForm providers={parseAuthProviders(process.env.NEXT_PUBLIC_AUTH_PROVIDERS)} />
        </Suspense>
      ) : (
        <AccountsDisabled />
      )}
    </AuthShell>
  );
}
