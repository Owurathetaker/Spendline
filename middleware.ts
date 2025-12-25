import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect dashboard routes
  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  // Supabase stores auth in cookies. If no access token cookie is present, redirect.
  // This is a lightweight guard that avoids hitting Supabase on every request.
  const hasAuthCookie =
    req.cookies.get("sb-access-token") ||
    req.cookies.get("sb-refresh-token") ||
    // fallback: some setups store a single "sb-<project-ref>-auth-token"
    Object.keys(req.cookies.getAll().reduce((a, c) => ({ ...a, [c.name]: true }), {})).some((k) =>
      k.includes("sb-") && k.includes("auth-token")
    );

  if (!hasAuthCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};