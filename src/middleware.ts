import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * 1) Refreshes Supabase auth cookies so server components/route handlers see a valid session.
 * 2) Guards /admin/* (defence in depth — the authoritative role check is server-side in
 *    the admin layout and every /api/admin route via getCurrentRole()/requireAdmin()).
 *
 * When Supabase is not configured this is a no-op and returns immediately.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function middleware(req: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  // Cheap path: no Supabase auth cookie and not an admin route → nothing to refresh.
  const hasAuthCookie = req.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!hasAuthCookie && !isAdmin) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  // getUser() validates the JWT with Supabase Auth and refreshes expired sessions.
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (isAdmin) {
    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
    const { data: profile } = await supabase.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin" || profile?.status !== "active") {
      // Let the admin layout render its 403 state (no information about admin pages leaks).
      const url = req.nextUrl.clone();
      url.pathname = "/admin";
      url.search = "";
      if (pathname !== "/admin") return NextResponse.redirect(url);
    }
  }
  return res;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, images, PWA/SEO files and the Stripe webhook
     * (which must receive the untouched raw body and has no session).
     */
    "/((?!_next/static|_next/image|favicon\\.ico|favicon-32\\.png|icon-|apple-touch-icon|brand/|sw\\.js|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|og\\.png|api/billing/webhook|api/market/).*)",
  ],
};
