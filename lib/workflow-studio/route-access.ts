import type { FeatureFlagSnapshot } from "@/lib/feature-flags";
import { getFeatureFlagSnapshot } from "@/lib/feature-flags";
import type { IdentityContext } from "@/lib/identity/types";
import { identityHasPermission, type WorkflowPermission } from "@/lib/rbac";

export type WorkflowStudioRouteAccess =
  | { authorized: true; requiredPermission: WorkflowPermission }
  | {
      authorized: false;
      reason: "feature_disabled" | "permission_denied";
      requiredPermission: WorkflowPermission;
    };

export function isWorkflowStudioPath(pathname: string): boolean {
  return pathname === "/workflow-studio" || pathname.startsWith("/workflow-studio/");
}

export function isWorkflowRuntimePath(pathname: string): boolean {
  return pathname === "/workflow-runtime" || pathname.startsWith("/workflow-runtime/");
}

export function isWorkflowTasksPath(pathname: string): boolean {
  return pathname === "/tasks" || pathname.startsWith("/tasks/");
}

export function authorizeWorkflowRuntimeRoute(
  identity: IdentityContext,
  pathname = "/workflow-runtime",
  flags: FeatureFlagSnapshot = getFeatureFlagSnapshot(),
): WorkflowStudioRouteAccess {
  const requiredPermission = workflowRuntimeRoutePermission(pathname);
  if (!flags["workflow_runtime.start"]) {
    return { authorized: false, reason: "feature_disabled", requiredPermission };
  }
  if (!identityHasPermission(identity, requiredPermission)) {
    return { authorized: false, reason: "permission_denied", requiredPermission };
  }
  return { authorized: true, requiredPermission };
}

export function authorizeWorkflowTasksRoute(
  identity: IdentityContext,
  flags: FeatureFlagSnapshot = getFeatureFlagSnapshot(),
): WorkflowStudioRouteAccess {
  const requiredPermission: WorkflowPermission = "workflow:tasks:execute";
  if (!flags["workflow_runtime.start"]) {
    return { authorized: false, reason: "feature_disabled", requiredPermission };
  }
  if (!identityHasPermission(identity, requiredPermission)) {
    return { authorized: false, reason: "permission_denied", requiredPermission };
  }
  return { authorized: true, requiredPermission };
}

export function workflowStudioRoutePermission(pathname: string): WorkflowPermission {
  return pathname === "/workflow-studio" || pathname === "/workflow-studio/"
    ? "workflow:view"
    : "workflow:design";
}

export function workflowRuntimeRoutePermission(pathname: string): WorkflowPermission {
  return /^\/workflow-runtime\/[^/]+\/start\/?$/.test(pathname)
    ? "workflow:start"
    : "workflow:view";
}

/** Shared route boundary for the proxy and server-rendered Studio pages. */
export function authorizeWorkflowStudioRoute(
  identity: IdentityContext,
  pathname: string,
  flags: FeatureFlagSnapshot = getFeatureFlagSnapshot(),
): WorkflowStudioRouteAccess {
  const requiredPermission = workflowStudioRoutePermission(pathname);

  if (!flags["workflow_studio.builder"]) {
    return { authorized: false, reason: "feature_disabled", requiredPermission };
  }
  if (!identityHasPermission(identity, requiredPermission)) {
    return { authorized: false, reason: "permission_denied", requiredPermission };
  }
  return { authorized: true, requiredPermission };
}
