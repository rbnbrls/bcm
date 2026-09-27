import { describe, expect, it } from "vitest";
import type { FeatureFlagSnapshot } from "@/lib/feature-flags";
import type { IdentityContext } from "@/lib/identity/types";
import {
  authorizeWorkflowRuntimeRoute,
  authorizeWorkflowStudioRoute,
  isWorkflowRuntimePath,
  isWorkflowStudioPath,
  workflowRuntimeRoutePermission,
  workflowStudioRoutePermission,
} from "@/lib/workflow-studio/route-access";
import { getVisibleNavigationItems } from "@/lib/rbac";

const enabledFlags: FeatureFlagSnapshot = {
  "workflow_studio.builder": true,
  "workflow_studio.publish": false,
  "workflow_runtime.start": false,
  "workflow_runtime.shadow_compare": false,
};

function identity(role: "change_manager" | "account_manager" | "admin"): IdentityContext {
  return {
    userId: role,
    displayName: role,
    groups: [`bcm:role:${role}`],
    tenant: "tenant-a",
    businessUnit: "investments",
    sessionId: `${role}-session`,
  };
}

describe("Workflow Studio route access", () => {
  it("recognizes only the Studio route namespace", () => {
    expect(isWorkflowStudioPath("/workflow-studio")).toBe(true);
    expect(isWorkflowStudioPath("/workflow-studio/new")).toBe(true);
    expect(isWorkflowStudioPath("/workflow-studio-other")).toBe(false);
  });

  it("recognizes only the runtime route namespace", () => {
    expect(isWorkflowRuntimePath("/workflow-runtime")).toBe(true);
    expect(isWorkflowRuntimePath("/workflow-runtime/version-1/start")).toBe(true);
    expect(isWorkflowRuntimePath("/workflow-runtime-other")).toBe(false);
  });

  it("requires view for the overview and design for new/editor routes", () => {
    expect(workflowStudioRoutePermission("/workflow-studio")).toBe("workflow:view");
    expect(workflowStudioRoutePermission("/workflow-studio/new")).toBe("workflow:design");
    expect(workflowStudioRoutePermission("/workflow-studio/definition-1/edit")).toBe("workflow:design");
  });

  it("requires view for runtime dashboards/details and start for start routes", () => {
    expect(workflowRuntimeRoutePermission("/workflow-runtime")).toBe("workflow:view");
    expect(workflowRuntimeRoutePermission("/workflow-runtime/instance-1")).toBe("workflow:view");
    expect(workflowRuntimeRoutePermission("/workflow-runtime/version-1/start")).toBe("workflow:start");
  });

  it("keeps every Studio route closed while the builder flag is disabled", () => {
    expect(authorizeWorkflowStudioRoute(identity("change_manager"), "/workflow-studio", {
      ...enabledFlags,
      "workflow_studio.builder": false,
    })).toMatchObject({ authorized: false, reason: "feature_disabled" });
  });

  it("lets viewers open only the overview and designers open authoring routes", () => {
    expect(authorizeWorkflowStudioRoute(identity("account_manager"), "/workflow-studio", enabledFlags).authorized).toBe(true);
    expect(authorizeWorkflowStudioRoute(identity("account_manager"), "/workflow-studio/new", enabledFlags)).toMatchObject({
      authorized: false,
      reason: "permission_denied",
    });
    expect(authorizeWorkflowStudioRoute(identity("change_manager"), "/workflow-studio/new", enabledFlags).authorized).toBe(true);
    expect(authorizeWorkflowStudioRoute(identity("admin"), "/workflow-studio/definition-1/edit", enabledFlags).authorized).toBe(false);
  });

  it("derives Studio navigation from server identity and the builder flag", () => {
    const enabled = getVisibleNavigationItems(identity("change_manager"), enabledFlags);
    const disabled = getVisibleNavigationItems(identity("change_manager"), {
      ...enabledFlags,
      "workflow_studio.builder": false,
    });
    const unauthorized = getVisibleNavigationItems({
      ...identity("admin"),
      groups: [],
    }, enabledFlags);

    expect(enabled.some((item) => item.href === "/workflow-studio")).toBe(true);
    expect(enabled.some((item) => item.href === "/admin")).toBe(false);
    expect(disabled.some((item) => item.href === "/workflow-studio")).toBe(false);
    expect(unauthorized.some((item) => item.href === "/workflow-studio")).toBe(false);
  });

  it("protects runtime routes with the feature flag and route-specific permissions", () => {
    expect(authorizeWorkflowRuntimeRoute(identity("change_manager"), "/workflow-runtime", enabledFlags)).toMatchObject({
      authorized: false,
      reason: "feature_disabled",
    });

    const runtimeFlags = { ...enabledFlags, "workflow_runtime.start": true };
    expect(authorizeWorkflowRuntimeRoute(identity("admin"), "/workflow-runtime", runtimeFlags).authorized).toBe(true);
    expect(authorizeWorkflowRuntimeRoute(identity("admin"), "/workflow-runtime/version-1/start", runtimeFlags)).toMatchObject({
      authorized: false,
      reason: "permission_denied",
      requiredPermission: "workflow:start",
    });
    expect(authorizeWorkflowRuntimeRoute({ ...identity("admin"), groups: [] }, "/workflow-runtime", runtimeFlags)).toMatchObject({
      authorized: false,
      reason: "permission_denied",
    });
  });
});
