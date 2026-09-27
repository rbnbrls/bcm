import type { IdentityContext } from "@/lib/identity/types";
import type { WorkflowDefinitionService, WorkflowServiceResult } from "@/lib/workflow-studio/definition-service";
import type {
  WorkflowDefinitionRow,
  WorkflowVersionRow,
} from "@/lib/workflow-studio/definition-repository";
import { getIdentityClientScope } from "@/lib/workflow-studio-authorization";

export type WorkflowOverviewItem = {
  definition: WorkflowDefinitionRow;
  draft: WorkflowVersionRow | null;
  published: WorkflowVersionRow | null;
};

export async function loadWorkflowOverview(
  service: WorkflowDefinitionService,
  identity: IdentityContext,
): Promise<WorkflowServiceResult<readonly WorkflowOverviewItem[]>> {
  if (!identity.tenant || !identity.businessUnit) {
    return {
      ok: false,
      code: "identity_scope_missing",
      message: "De identiteit heeft geen tenant- en businessunit-scope.",
    };
  }
  const clientIds = getIdentityClientScope(identity);
  const listed = await service.listForScope(identity, {
    tenant: identity.tenant,
    businessUnit: identity.businessUnit,
    ...(clientIds ? { clientIds } : {}),
  });
  if (!listed.ok) return listed;

  const items: WorkflowOverviewItem[] = [];
  for (const definition of listed.value) {
    const loaded = await service.load(identity, { definitionId: definition.id, includeDraft: true });
    if (!loaded.ok) return loaded;
    if (!loaded.value || !("definition" in loaded.value) || !("draft" in loaded.value)) continue;
    items.push({
      definition: loaded.value.definition,
      draft: loaded.value.draft,
      published: loaded.value.published,
    });
  }
  return { ok: true, code: "ok", value: Object.freeze(items) };
}
