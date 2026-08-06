import { NextResponse, type NextRequest } from "next/server";
import { identityHasPermission } from "@/lib/rbac";
import { getIdentityContext } from "@/lib/identity/request";

/**
 * Route-level RBAC gate for the /admin/* area.
 */
export async function proxy(request: NextRequest) {
  const identity = await getIdentityContext(request);
  if (identityHasPermission(identity, "admin:access")) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/admin/:path*"],
};
