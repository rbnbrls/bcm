import { NextResponse, type NextRequest } from "next/server";
import { ACTIVE_ROLE_COOKIE, roleHasPermission, resolveRole } from "@/lib/rbac";

/**
 * Route-level RBAC gate for the /admin/* area.
 */
export function proxy(request: NextRequest) {
  const activeRole = resolveRole(request.cookies.get(ACTIVE_ROLE_COOKIE)?.value);
  if (roleHasPermission(activeRole, "admin:access")) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/admin/:path*"],
};
