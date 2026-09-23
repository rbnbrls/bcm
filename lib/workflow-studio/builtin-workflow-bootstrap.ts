import { captureError } from "@/lib/sentry-helper";
import type { IdentityContext } from "@/lib/identity/types";
import {
  BUILTIN_WORKFLOW_TEMPLATE_IDS,
  buildBuiltinWorkflowTemplateDraft,
} from "@/lib/workflow-studio/builtin-workflow-templates";
import {
  WorkflowDefinitionRepository,
  type SqlExecutor,
} from "@/lib/workflow-studio/definition-repository";

const BOOTSTRAP_OWNER = "workflow-builtin-bootstrap";

/**
 * Installs the repository-owned workflow templates in the current scope.
 *
 * This is deliberately additive: an existing definition is never overwritten,
 * so customer edits and published versions remain immutable. The code-defined
 * templates are therefore the source for a first deployment, while the
 * database remains the runtime source after installation.
 */
export async function ensureBuiltinWorkflowCatalog(
  sql: SqlExecutor,
  identity: IdentityContext,
): Promise<void> {
  if (!identity.tenant || !identity.businessUnit) return;
  // Lightweight SQL doubles used by catalog unit tests do not implement the
  // repository's tagged-template helpers. The real postgres client always does.
  if (typeof (sql as { unsafe?: unknown }).unsafe !== "function") return;

  const repository = new WorkflowDefinitionRepository(sql);
  const scope = { tenant: identity.tenant, businessUnit: identity.businessUnit };
  const existing = await repository.listDefinitionsForScope(scope);
  const existingBySlug = new Map(existing.map((definition) => [definition.slug, definition]));

  for (const templateId of BUILTIN_WORKFLOW_TEMPLATE_IDS) {
    if (existingBySlug.has(templateId)) continue;
    try {
      const draft = buildBuiltinWorkflowTemplateDraft(templateId, identity, scope);
      const created = await repository.createDraft(draft, BOOTSTRAP_OWNER);
      const revision = Number(created.draft?.revision ?? 1);
      await repository.recordReview({
        definitionId: created.definition.id,
        expectedRevision: revision,
        decision: "submitted",
        notes: "Repository-owned built-in workflow installed during deployment.",
        reviewerUserId: BOOTSTRAP_OWNER,
      });
      await repository.recordReview({
        definitionId: created.definition.id,
        expectedRevision: revision,
        decision: "approved",
        notes: "Repository-owned built-in workflow approved for the initial deployment.",
        reviewerUserId: BOOTSTRAP_OWNER,
      });
      await repository.publish(created.definition.id, revision, BOOTSTRAP_OWNER);
      existingBySlug.set(templateId, created.definition);
    } catch (error) {
      // A second request can race the first request after the initial lookup.
      // In that case the unique constraint has already made the desired state
      // true; other failures must remain visible in GlitchTip.
      if (!String(error instanceof Error ? error.message : error).toLowerCase().includes("duplicate")) {
        captureError(error, {
          endpoint: "ensureBuiltinWorkflowCatalog",
          phase: "seed_builtin_workflow",
          tenant: identity.tenant,
          businessUnit: identity.businessUnit,
          definitionId: templateId,
        });
      }
    }
  }
}
