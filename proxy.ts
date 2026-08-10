import { NextResponse, type NextRequest } from "next/server";
import { identityHasPermission } from "@/lib/rbac";
import { getIdentityContext } from "@/lib/identity/request";
import { authorizeWorkflowStudioRoute, isWorkflowStudioPath } from "@/lib/workflow-studio/route-access";

/** Route-level RBAC and rollout gate for protected application areas. */
export async function proxy(request: NextRequest) {
  const identity = await getIdentityContext(request);
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/admin")) {
    return identityHasPermission(identity, "admin:access")
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/", request.url));
  }

  if (isWorkflowStudioPath(pathname)) {
    return authorizeWorkflowStudioRoute(identity, pathname).authorized
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/workflow-studio/:path*"],
};
