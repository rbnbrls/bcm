import type { IdentityContext } from "@/lib/identity/types";
import {
  getIdentityRoles,
  getProfile,
  identityHasPermission,
  isRoleId,
  type RoleId,
  type WorkflowPermission,
} from "@/lib/rbac";
import { RBAC_CONFIG } from "@/lib/rbac-config";

export const WORKFLOW_CLIENT_GROUP_PREFIX = "bcm:client:";

/**
 * A missing clientIds list means the complete business unit. An explicit list
 * narrows access to those clients. Tenant and business unit are always
 * required so authorization fails closed for unscoped identities.
 */
export type WorkflowDataScope = {
  tenant: string;
  businessUnit: string;
  clientIds?: readonly string[];
};

export type WorkflowRuntimePermission = Extract<
  WorkflowPermission,
  "workflow:start" | "workflow:tasks:execute" | "workflow:approve"
>;

export type WorkflowRoleBindingInput = {
  workflowRoleId: string;
  identityGroups: readonly string[];
  permissions: readonly WorkflowRuntimePermission[];
  scope: WorkflowDataScope;
};

export type WorkflowAuthorizationCode =
  | "allowed"
  | "permission_denied"
  | "identity_scope_missing"
  | "invalid_scope"
  | "tenant_out_of_scope"
  | "business_unit_out_of_scope"
  | "client_out_of_scope"
  | "business_unit_scope_out_of_scope"
  | "invalid_role_binding"
  | "role_out_of_scope"
  | "role_capability_mismatch";

export type WorkflowAuthorizationDecision =
  | { authorized: true; code: "allowed" }
  | { authorized: false; code: Exclude<WorkflowAuthorizationCode, "allowed">; message: string };

const allowed: WorkflowAuthorizationDecision = { authorized: true, code: "allowed" };

function denied(
  code: Exclude<WorkflowAuthorizationCode, "allowed">,
  message: string,
): WorkflowAuthorizationDecision {
  return { authorized: false, code, message };
}

function normalizedValues(values: readonly string[] | undefined): string[] | null {
  if (values === undefined) return null;
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  return normalized.length > 0 ? normalized : [];
}

export function getIdentityClientScope(identity: IdentityContext): string[] | null {
  const clientIds = identity.groups
    .filter((group) => group.startsWith(WORKFLOW_CLIENT_GROUP_PREFIX))
    .map((group) => group.slice(WORKFLOW_CLIENT_GROUP_PREFIX.length).trim())
    .filter(Boolean);
  return clientIds.length > 0 ? [...new Set(clientIds)] : null;
}

/**
 * Checks that a requested workflow scope is contained by the signed identity
 * scope. Client claims narrow an identity: when any bcm:client:* claim exists,
 * business-unit-wide access is no longer available.
 */
export function authorizeWorkflowScope(
  identity: IdentityContext,
  scope: WorkflowDataScope,
): WorkflowAuthorizationDecision {
  if (!identity.tenant || !identity.businessUnit) {
    return denied("identity_scope_missing", "De identiteit heeft geen tenant- en businessunit-scope.");
  }
  if (!scope.tenant.trim() || !scope.businessUnit.trim()) {
    return denied("invalid_scope", "Een workflowscope vereist een tenant en businessunit.");
  }
  if (scope.tenant !== identity.tenant) {
    return denied("tenant_out_of_scope", "De tenant valt buiten het beheerbereik van de gebruiker.");
  }
  if (scope.businessUnit !== identity.businessUnit) {
    return denied("business_unit_out_of_scope", "De businessunit valt buiten het beheerbereik van de gebruiker.");
  }

  const requestedClients = normalizedValues(scope.clientIds);
  if (requestedClients?.length === 0) {
    return denied("invalid_scope", "Een expliciete client-scope moet minimaal één client bevatten.");
  }

  const identityClients = getIdentityClientScope(identity);
  if (identityClients === null) return allowed;

  if (requestedClients === null) {
    return denied(
      "business_unit_scope_out_of_scope",
      "Een clientgebonden gebruiker mag geen businessunit-brede workflowscope gebruiken.",
    );
  }
  if (requestedClients.some((clientId) => !identityClients.includes(clientId))) {
    return denied("client_out_of_scope", "Minimaal één client valt buiten het beheerbereik van de gebruiker.");
  }
  return allowed;
}

export function authorizeWorkflowAction(
  identity: IdentityContext,
  permission: WorkflowPermission,
  scope: WorkflowDataScope,
): WorkflowAuthorizationDecision {
  if (!identityHasPermission(identity, permission)) {
    return denied("permission_denied", "De gebruiker mist de vereiste Workflow Studio-permissie.");
  }
  return authorizeWorkflowScope(identity, scope);
}

function roleFromIdentityGroup(group: string): RoleId | null {
  const prefix = "bcm:role:";
  if (!group.startsWith(prefix)) return null;
  const role = group.slice(prefix.length);
  return isRoleId(role) ? role : null;
}

function delegableRoles(identity: IdentityContext): Set<RoleId> {
  return new Set(
    getIdentityRoles(identity).flatMap((role) => RBAC_CONFIG.workflowRoleDelegation[role] ?? []),
  );
}

/**
 * Validates the authoring-time security boundary for workflow role bindings.
 * Only configured application roles can be bound in this foundation phase.
 */
export function authorizeWorkflowRoleBinding(
  identity: IdentityContext,
  binding: WorkflowRoleBindingInput,
): WorkflowAuthorizationDecision {
  const actionDecision = authorizeWorkflowAction(identity, "workflow:manage", binding.scope);
  if (!actionDecision.authorized) return actionDecision;

  if (
    !binding.workflowRoleId.trim()
    || binding.identityGroups.length === 0
    || binding.permissions.length === 0
  ) {
    return denied(
      "invalid_role_binding",
      "Een rolbinding vereist een workflowrol, identiteitgroep en runtime-capability.",
    );
  }

  const allowedRoles = delegableRoles(identity);
  for (const group of binding.identityGroups) {
    const role = roleFromIdentityGroup(group);
    if (!role || !allowedRoles.has(role)) {
      return denied("role_out_of_scope", `Identiteitgroep ${group} valt buiten het rolbeheerbereik.`);
    }
    const profile = getProfile(role);
    if (binding.permissions.some((permission) => !profile.permissions.includes(permission))) {
      return denied(
        "role_capability_mismatch",
        `Identiteitgroep ${group} bezit niet alle toegekende workflow-capabilities.`,
      );
    }
  }
  return allowed;
}
