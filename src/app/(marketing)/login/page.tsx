import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { isSupabaseConfigured } from "@/lib/config";
import { AccountsDisabled, AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { parseAuthProviders } from "@/components/auth/providers";
import { Skeleton } from "@/components/ui/States";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to XRP Terminal to sync your wallets, alerts, paper trades and settings across devices.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  const enabled = isSupabaseConfigured();
  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back to XRP Terminal."
      footer={
        enabled ? (
          <>
            New here?{" "}
            <Link href="/signup" className="font-medium text-accent-strong hover:underline">
              Create a free account
            </Link>
          </>
        ) : undefined
      }
    >
      {enabled ? (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <LoginForm providers={parseAuthProviders(process.env.NEXT_PUBLIC_AUTH_PROVIDERS)} />
        </Suspense>
      ) : (
        <AccountsDisabled />
      )}
    </AuthShell>
  );
}
