import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Cheap optimistic check (cookie presence only). Real session validation
// happens in requireUser() on every page and action.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/sign-in", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/today/:path*", "/nutrition/:path*", "/train/:path*", "/progress/:path*", "/coach/:path*", "/settings/:path*", "/onboarding/:path*"],
};
