import { describe, expect, it } from "vitest";
import type { IdentityContext } from "@/lib/identity/types";
import { roleHasPermission } from "@/lib/rbac";
import {
  authorizeWorkflowAction,
  authorizeWorkflowRoleBinding,
  authorizeWorkflowScope,
} from "@/lib/workflow-studio-authorization";

function identity(
  role: string,
  overrides: Partial<IdentityContext> = {},
): IdentityContext {
  return {
    userId: `user:${role}`,
    displayName: role,
    groups: [`bcm:role:${role}`],
    tenant: "tenant-a",
    businessUnit: "investments",
    sessionId: `session:${role}`,
    ...overrides,
  };
}

const unitScope = { tenant: "tenant-a", businessUnit: "investments" } as const;

describe("Workflow Studio permissions", () => {
  it("separates authoring, approval and administrative permissions", () => {
    expect(roleHasPermission("change_manager", "workflow:design")).toBe(true);
    expect(roleHasPermission("change_manager", "workflow:test")).toBe(true);
    expect(roleHasPermission("change_manager", "workflow:publish")).toBe(true);
    expect(roleHasPermission("change_manager", "workflow:start")).toBe(true);
    expect(roleHasPermission("change_manager", "workflow:tasks:execute")).toBe(true);
    expect(roleHasPermission("change_manager", "workflow:approve")).toBe(false);

    expect(roleHasPermission("account_manager", "workflow:view")).toBe(true);
    expect(roleHasPermission("account_manager", "workflow:tasks:execute")).toBe(true);
    expect(roleHasPermission("account_manager", "workflow:approve")).toBe(true);
    expect(roleHasPermission("account_manager", "workflow:publish")).toBe(false);
    expect(roleHasPermission("account_manager", "workflow:manage")).toBe(false);

    expect(roleHasPermission("admin", "workflow:manage")).toBe(true);
    expect(roleHasPermission("admin", "workflow:deprecate")).toBe(true);
  });

  it("requires both permission and scope for every workflow action", () => {
    expect(authorizeWorkflowAction(identity("change_manager"), "workflow:publish", unitScope)).toEqual({
      authorized: true,
      code: "allowed",
    });
    expect(authorizeWorkflowAction(identity("account_manager"), "workflow:publish", unitScope)).toMatchObject({
      authorized: false,
      code: "permission_denied",
    });
  });
});

describe("Workflow Studio data scope", () => {
  it("allows the signed identity business unit and denies other tenants or units", () => {
    const actor = identity("change_manager");
    expect(authorizeWorkflowScope(actor, unitScope).authorized).toBe(true);
    expect(authorizeWorkflowScope(actor, { ...unitScope, tenant: "tenant-b" })).toMatchObject({
      authorized: false,
      code: "tenant_out_of_scope",
    });
    expect(authorizeWorkflowScope(actor, { ...unitScope, businessUnit: "operations" })).toMatchObject({
      authorized: false,
      code: "business_unit_out_of_scope",
    });
  });

  it("narrows access to client claims and prevents escalation to the whole unit", () => {
    const actor = identity("change_manager", {
      groups: ["bcm:role:change_manager", "bcm:client:client-1", "bcm:client:client-2"],
    });

    expect(authorizeWorkflowScope(actor, { ...unitScope, clientIds: ["client-2"] }).authorized).toBe(true);
    expect(authorizeWorkflowScope(actor, { ...unitScope, clientIds: ["client-3"] })).toMatchObject({
      authorized: false,
      code: "client_out_of_scope",
    });
    expect(authorizeWorkflowScope(actor, unitScope)).toMatchObject({
      authorized: false,
      code: "business_unit_scope_out_of_scope",
    });
  });

  it("fails closed when the signed identity has no complete organizational scope", () => {
    expect(authorizeWorkflowScope(identity("change_manager", { businessUnit: null }), unitScope)).toMatchObject({
      authorized: false,
      code: "identity_scope_missing",
    });
  });

  it("rejects an explicitly empty client scope", () => {
    expect(authorizeWorkflowScope(identity("change_manager"), { ...unitScope, clientIds: [] })).toMatchObject({
      authorized: false,
      code: "invalid_scope",
    });
  });
});

describe("Workflow Studio role delegation", () => {
  it("allows a maker to bind a configured approval role inside their scope", () => {
    expect(authorizeWorkflowRoleBinding(identity("change_manager"), {
      workflowRoleId: "checker",
      identityGroups: ["bcm:role:account_manager"],
      permissions: ["workflow:tasks:execute", "workflow:approve"],
      scope: unitScope,
    })).toEqual({ authorized: true, code: "allowed" });
  });

  it("rejects roles and capabilities outside the maker's delegation range", () => {
    expect(authorizeWorkflowRoleBinding(identity("change_manager"), {
      workflowRoleId: "system-administrator",
      identityGroups: ["bcm:role:admin"],
      permissions: ["workflow:start"],
      scope: unitScope,
    })).toMatchObject({ authorized: false, code: "role_out_of_scope" });

    expect(authorizeWorkflowRoleBinding(identity("change_manager"), {
      workflowRoleId: "checker",
      identityGroups: ["bcm:role:account_manager"],
      permissions: ["workflow:start"],
      scope: unitScope,
    })).toMatchObject({ authorized: false, code: "role_capability_mismatch" });
  });

  it("rejects a valid role binding when its client scope exceeds the maker's scope", () => {
    const actor = identity("change_manager", {
      groups: ["bcm:role:change_manager", "bcm:client:client-1"],
    });
    expect(authorizeWorkflowRoleBinding(actor, {
      workflowRoleId: "checker",
      identityGroups: ["bcm:role:account_manager"],
      permissions: ["workflow:approve"],
      scope: { ...unitScope, clientIds: ["client-2"] },
    })).toMatchObject({ authorized: false, code: "client_out_of_scope" });
  });

  it("does not let non-managers create role bindings", () => {
    expect(authorizeWorkflowRoleBinding(identity("account_manager"), {
      workflowRoleId: "checker",
      identityGroups: ["bcm:role:account_manager"],
      permissions: ["workflow:approve"],
      scope: unitScope,
    })).toMatchObject({ authorized: false, code: "permission_denied" });
  });
});
