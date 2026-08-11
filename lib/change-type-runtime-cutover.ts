import type { ChangeTypeConfig } from "@/lib/types";

export type ChangeTypePublishedWorkflowRef = {
  id: string;
  status: "published" | "draft" | string;
  definitionSlug?: string | null;
};

export type ChangeTypeRuntimeCutoverMode =
  | "runtime"
  | "classic_compatibility"
  | "blocked_missing_version"
  | "blocked_unpublished_version";

export type ChangeTypeRuntimeCutoverDecision = {
  slug: string;
  mode: ChangeTypeRuntimeCutoverMode;
  workflowVersionId: string | null;
  startHref: string | null;
  issue?: string;
};

export type ChangeTypeRuntimeCutoverAudit = {
  ok: boolean;
  decisions: readonly ChangeTypeRuntimeCutoverDecision[];
  issues: readonly ChangeTypeRuntimeCutoverDecision[];
};

export function resolveChangeTypeRuntimeCutover(
  config: Pick<ChangeTypeConfig, "slug" | "active" | "workflowVersionId">,
  publishedVersions: readonly ChangeTypePublishedWorkflowRef[],
): ChangeTypeRuntimeCutoverDecision {
  const workflowVersionId = config.workflowVersionId ?? null;
  if (!config.active) {
    return {
      slug: config.slug,
      mode: "classic_compatibility",
      workflowVersionId,
      startHref: null,
    };
  }
  if (!workflowVersionId) {
    return {
      slug: config.slug,
      mode: "blocked_missing_version",
      workflowVersionId: null,
      startHref: null,
      issue: "Actief change type heeft geen workflow_version_id.",
    };
  }
  const version = publishedVersions.find((candidate) => candidate.id === workflowVersionId);
  if (!version || version.status !== "published") {
    return {
      slug: config.slug,
      mode: "blocked_unpublished_version",
      workflowVersionId,
      startHref: null,
      issue: "workflow_version_id verwijst niet naar een gepubliceerde workflowversie.",
    };
  }
  return {
    slug: config.slug,
    mode: "runtime",
    workflowVersionId,
    startHref: `/workflow-runtime/${workflowVersionId}/start`,
  };
}

export function auditChangeTypeRuntimeCutover(
  configs: readonly Pick<ChangeTypeConfig, "slug" | "active" | "workflowVersionId">[],
  publishedVersions: readonly ChangeTypePublishedWorkflowRef[],
): ChangeTypeRuntimeCutoverAudit {
  const decisions = configs.map((config) => resolveChangeTypeRuntimeCutover(config, publishedVersions));
  const issues = decisions.filter((decision) => decision.mode.startsWith("blocked_"));
  return {
    ok: issues.length === 0,
    decisions,
    issues,
  };
}

export function changeTypeRuntimeStartHref(
  config: Pick<ChangeTypeConfig, "slug" | "active" | "workflowVersionId">,
  publishedVersions: readonly ChangeTypePublishedWorkflowRef[],
): string {
  return resolveChangeTypeRuntimeCutover(config, publishedVersions).startHref
    ?? `/changes/new?type=${config.slug}`;
}
