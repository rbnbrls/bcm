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

  const response = NextResponse.json(
    { error: "Alleen een Beheerder kan beheerfuncties gebruiken." },
    { status: 403 },
  );
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
