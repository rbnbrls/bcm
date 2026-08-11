import { NextResponse, type NextRequest } from "next/server";
import { identityHasPermission } from "@/lib/rbac";
import { getIdentityContext } from "@/lib/identity/request";
import {
  authorizeWorkflowRuntimeRoute,
  authorizeWorkflowStudioRoute,
  authorizeWorkflowTasksRoute,
  isWorkflowRuntimePath,
  isWorkflowStudioPath,
  isWorkflowTasksPath,
} from "@/lib/workflow-studio/route-access";
import {
  applyWorkflowSecurityHeaders,
  WorkflowRouteRateLimiter,
  workflowRouteRateLimitBucket,
} from "@/lib/workflow-studio/security-hardening";

const workflowRateLimiter = new WorkflowRouteRateLimiter();

function protectedResponse(response: NextResponse, request: NextRequest, identity: Awaited<ReturnType<typeof getIdentityContext>>): NextResponse {
  applyWorkflowSecurityHeaders(response.headers);
  const bucket = workflowRouteRateLimitBucket({
    pathname: request.nextUrl.pathname,
    method: request.method,
    identity,
    headers: request.headers,
  });
  if (!bucket) return response;
  const decision = workflowRateLimiter.check(bucket);
  response.headers.set("X-RateLimit-Limit", String(bucket.limit));
  response.headers.set("X-RateLimit-Remaining", String(decision.remaining));
  response.headers.set("X-RateLimit-Reset", String(Math.ceil(decision.resetAt / 1000)));
  if (decision.allowed) return response;
  const limited = new NextResponse("Too many requests", { status: 429 });
  applyWorkflowSecurityHeaders(limited.headers);
  limited.headers.set("Retry-After", String(decision.retryAfterSeconds));
  limited.headers.set("X-RateLimit-Limit", String(bucket.limit));
  limited.headers.set("X-RateLimit-Remaining", "0");
  limited.headers.set("X-RateLimit-Reset", String(Math.ceil(decision.resetAt / 1000)));
  return limited;
}

/** Route-level RBAC and rollout gate for protected application areas. */
export async function proxy(request: NextRequest) {
  const identity = await getIdentityContext(request);
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/admin")) {
    const response = identityHasPermission(identity, "admin:access")
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/", request.url));
    return protectedResponse(response, request, identity);
  }

  if (isWorkflowStudioPath(pathname)) {
    const response = authorizeWorkflowStudioRoute(identity, pathname).authorized
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/", request.url));
    return protectedResponse(response, request, identity);
  }

  if (isWorkflowRuntimePath(pathname)) {
    const response = authorizeWorkflowRuntimeRoute(identity, pathname).authorized
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/change-catalog", request.url));
    return protectedResponse(response, request, identity);
  }

  if (isWorkflowTasksPath(pathname)) {
    const response = authorizeWorkflowTasksRoute(identity).authorized
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/", request.url));
    return protectedResponse(response, request, identity);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/workflow-studio/:path*", "/workflow-runtime/:path*", "/tasks/:path*", "/tasks"],
};
