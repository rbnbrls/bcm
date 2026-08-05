import { CHANGE_STATUS_NEXT, type ChangeStatus } from "@/lib/types";
import {
  resolveWorkflowTemplate,
  type ApplyStrategy,
  type ChangeTypeFormKind,
} from "@/lib/change-types/templates";
import type { Permission } from "@/lib/rbac";

export type SubmitActionId =
  | "benchmark_switch"
  | "generic_change"
  | "portfolio_configuration"
  | "client_onboarding"
  | "asset_class_request"
  | "sub_asset_class_request";

export type DetailRendererId =
  | "benchmark_switch"
  | "generic_change"
  | "new_benchmark"
  | "lookup_request"
  | "portfolio_configuration"
  | "client_onboarding";

export type StatusFlow = Record<ChangeStatus, ChangeStatus | null>;

export type ChangeTypeRegistration = {
  slug: string;
  formKind: ChangeTypeFormKind;
  submitAction: SubmitActionId;
  applyStrategy: ApplyStrategy;
  detailRenderer: DetailRendererId;
  permissions: {
    create: Permission;
    approve: Permission;
  };
  statusFlow: StatusFlow;
};

const DEFAULT_PERMISSIONS: ChangeTypeRegistration["permissions"] = {
  create: "changes:create",
  approve: "changes:approve",
};

const DEFAULT_STATUS_FLOW: StatusFlow = CHANGE_STATUS_NEXT;

const REGISTRATION_OVERRIDES: Record<string, Partial<ChangeTypeRegistration>> = {
  benchmark_switch: {
    submitAction: "benchmark_switch",
    detailRenderer: "benchmark_switch",
  },
  new_benchmark: {
    submitAction: "generic_change",
    detailRenderer: "new_benchmark",
  },
  new_asset_class: {
    submitAction: "asset_class_request",
    detailRenderer: "lookup_request",
  },
  new_sub_asset_class: {
    submitAction: "sub_asset_class_request",
    detailRenderer: "lookup_request",
  },
  client_onboarding: {
    submitAction: "client_onboarding",
    detailRenderer: "client_onboarding",
  },
  customer_onboarding: {
    applyStrategy: "staged_client_onboarding",
    submitAction: "client_onboarding",
    detailRenderer: "client_onboarding",
  },
  portfolio_addition: {
    submitAction: "portfolio_configuration",
    detailRenderer: "portfolio_configuration",
  },
  portfolio_configuration_create: {
    submitAction: "portfolio_configuration",
    detailRenderer: "portfolio_configuration",
  },
  portfolio_configuration_update: {
    submitAction: "generic_change",
    detailRenderer: "portfolio_configuration",
  },
  portfolio_configuration_retire: {
    submitAction: "generic_change",
    detailRenderer: "portfolio_configuration",
  },
};

function defaultSubmitAction(formKind: ChangeTypeFormKind): SubmitActionId {
  switch (formKind) {
    case "portfolio-create":
      return "portfolio_configuration";
    case "client-onboarding":
      return "client_onboarding";
    case "asset-class-request":
      return "asset_class_request";
    case "sub-asset-class-request":
      return "sub_asset_class_request";
    case "generic":
      return "generic_change";
  }
}

export function resolveChangeTypeRegistration(slug: string | undefined): ChangeTypeRegistration {
  const template = resolveWorkflowTemplate(slug);
  const resolvedSlug = slug ?? template.id;
  const overrides = REGISTRATION_OVERRIDES[resolvedSlug] ?? {};

  return {
    slug: resolvedSlug,
    formKind: overrides.formKind ?? template.formKind,
    submitAction: overrides.submitAction ?? defaultSubmitAction(overrides.formKind ?? template.formKind),
    applyStrategy: overrides.applyStrategy ?? template.applyStrategy,
    detailRenderer: overrides.detailRenderer ?? "generic_change",
    permissions: overrides.permissions ?? DEFAULT_PERMISSIONS,
    statusFlow: overrides.statusFlow ?? DEFAULT_STATUS_FLOW,
  };
}

export function getStatusFlowForChangeType(slug: string | undefined): StatusFlow {
  return resolveChangeTypeRegistration(slug).statusFlow;
}

export function getChangeTypePermission(
  slug: string | undefined,
  action: keyof ChangeTypeRegistration["permissions"],
): Permission {
  return resolveChangeTypeRegistration(slug).permissions[action];
}
