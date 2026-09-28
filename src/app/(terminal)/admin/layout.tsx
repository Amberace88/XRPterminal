import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Database, ShieldAlert, ShieldCheck } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/config";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isServiceRoleConfigured } from "@/lib/server/env";
import { evaluateAdminAccess } from "@/lib/admin/guard";
import { PageHeader } from "@/components/ui/Misc";
import { Badge } from "@/components/ui/Badge";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

function StateCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-border-subtle bg-surface p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-surface-hover text-fg-muted">{icon}</div>
      <h1 className="mt-4 text-lg font-semibold text-fg">{title}</h1>
      <div className="mt-2 text-sm leading-relaxed text-fg-secondary">{children}</div>
    </div>
  );
}

/**
 * Admin area. Authorization is decided HERE on the server (role + status read from the
 * database), and again in every /api/admin route. Never trusts a client-side flag.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    return (
      <StateCard icon={<Database className="h-6 w-6" />} title="Admin requires database connection">
        Connect Supabase (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) and apply the migrations to enable administration.
        See docs/DEPLOYMENT.md.
      </StateCard>
    );
  }
  const sb = await getSupabaseServer();
  const { data } = (await sb?.auth.getUser()) ?? { data: { user: null } };
  const user = data.user;
  if (!user) redirect("/login?next=/admin");
  const { data: profile } = await sb!.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
  const access = evaluateAdminAccess({ configured: true, userId: user.id, role: profile?.role as string | undefined, status: profile?.status as string | undefined });
  if (!access.ok) {
    return (
      <StateCard icon={<ShieldAlert className="h-6 w-6" />} title="403 — Admin access required">
        Your account does not have administrator permissions.{" "}
        <Link href="/dashboard" className="text-accent-strong hover:underline">
          Back to dashboard
        </Link>
      </StateCard>
    );
  }
  return (
    <div>
      <PageHeader
        title="Administration"
        description="Operational view of users, revenue, providers, jobs and moderation. Every action is audited."
        badge={
          <Badge tone="info">
            <ShieldCheck className="h-3 w-3" /> Admin
          </Badge>
        }
      />
      {!isServiceRoleConfigured() && (
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning/[0.07] px-3 py-2 text-xs text-warning">
          SUPABASE_SERVICE_ROLE_KEY is not configured on the server — admin data endpoints will return “service role missing”.
        </p>
      )}
      <AdminNav />
      {children}
    </div>
  );
}
