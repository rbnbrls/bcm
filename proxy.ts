import { NextResponse, type NextRequest } from "next/server";
import { adminIsAuthorized } from "@/lib/admin-auth";

/**
 * Route-level auth gate for the /admin/* area.
 *
 * BCM has no user/role system; the admin surface is protected by HTTP
 * Basic Auth backed by the ADMIN_USER / ADMIN_PASSWORD environment
 * variables (see lib/admin-auth.ts for the shared check).
 *
 * Every request under /admin/* — page navigations AND the POSTs that
 * carry admin server actions — must present valid Basic credentials,
 * otherwise a 401 with a WWW-Authenticate challenge is returned. For
 * browsers this triggers the native credentials prompt; scripted /
 * anonymous callers simply get 401 and the admin server action never
 * executes.
 *
 * Fails closed: when the env vars are not configured, all admin
 * requests are rejected (no default credentials exist).
 *
 * Server actions additionally re-check authorization via
 * requireAdmin() (lib/admin-auth-request.ts) as defense in depth.
 */
export function proxy(request: NextRequest) {
  if (adminIsAuthorized(request.headers.get("authorization"))) {
    return NextResponse.next();
  }

  const response = NextResponse.json(
    { error: "Unauthorized" },
    { status: 401 },
  );
  response.headers.set(
    "WWW-Authenticate",
    'Basic realm="BCM Admin", charset="UTF-8"',
  );
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
