import { notFound, redirect } from "next/navigation";
import { getIdentityContext } from "@/lib/identity/request";
import { sql } from "@/lib/db";
import { authorizeWorkflowStudioRoute } from "@/lib/workflow-studio/route-access";
import { createWorkflowDefinitionService } from "@/lib/workflow-studio/definition-service";
import { WorkflowDefinitionRepository } from "@/lib/workflow-studio/definition-repository";
import { createWorkflowReviewDiff } from "@/lib/workflow-studio/workflow-review";
import { blockRegistry } from "@/lib/workflow-studio/block-registry";
import { clientConfigDataCatalog, toPublicChangeRequestCatalog, toPublicDataCatalog } from "@/lib/workflow-studio/data-catalog";
import type { WorkflowEditorNode } from "@/lib/workflow-studio/editor-model";
import { WorkflowEditorShell } from "./workflow-editor-shell";

type Props = { params: Promise<{ definitionId: string }> };

export default async function WorkflowEditorPage({ params }: Props) {
  const identity = await getIdentityContext();
  if (!authorizeWorkflowStudioRoute(identity, "/workflow-studio/definition/edit").authorized) redirect("/workflow-studio");
  if (!sql) redirect("/workflow-studio?error=database-niet-beschikbaar");
  const { definitionId } = await params;
  const service = createWorkflowDefinitionService(sql);
  const loaded = await service.load(identity, { definitionId, includeDraft: true });
  if (!loaded.ok) redirect(`/workflow-studio?error=${encodeURIComponent(loaded.message)}`);
  if (!loaded.value || !("draft" in loaded.value)) notFound();
  if (!loaded.value.draft) redirect("/workflow-studio?error=geen-bewerkbare-draft");
  const catalog = blockRegistry.listForIdentity(identity);
  const authorizedDataCatalog = clientConfigDataCatalog.listForIdentity(identity, {
    tenant: loaded.value.definition.tenant,
    businessUnit: loaded.value.definition.businessUnit,
    ...(loaded.value.definition.clientIds ? { clientIds: loaded.value.definition.clientIds } : {}),
  });
  const dataCatalog = toPublicDataCatalog(authorizedDataCatalog);
  const changeRequestCatalog = toPublicChangeRequestCatalog(authorizedDataCatalog);
  const catalogByType = new Map(catalog.map((entry) => [entry.blockType, entry]));
  const initialNodes: WorkflowEditorNode[] = loaded.value.nodes.map((node) => {
    const entry = catalogByType.get(node.blockType);
    const configuration = node.configuration && typeof node.configuration === "object"
      ? node.configuration as Record<string, unknown>
      : {};
    const configuredLabel = configuration.label ?? configuration.title ?? configuration.subject;
    return {
      id: node.id,
      nodeKey: node.nodeKey,
      blockType: node.blockType,
      contractVersion: node.blockContractVersion,
      label: typeof configuredLabel === "string" ? configuredLabel : entry?.ui.label ?? node.blockType,
      description: entry?.ui.description ?? "Onbekend blokcontract.",
      configuration: node.configuration,
      position: { x: node.positionX, y: node.positionY },
    };
  });
  const initialEdges = loaded.value.edges.map((edge) => ({
    id: edge.id,
    edgeKey: edge.edgeKey,
    sourceNodeId: edge.sourceNodeId,
    sourcePort: edge.sourcePort,
    targetNodeId: edge.targetNodeId,
    targetPort: edge.targetPort,
  }));
  const baselineResult = loaded.value.published
    ? await service.load(identity, { versionId: loaded.value.published.id })
    : null;
  const baseline = baselineResult?.ok && baselineResult.value && "version" in baselineResult.value
    ? baselineResult.value
    : null;
  const reviewDiff = createWorkflowReviewDiff({
    definition: loaded.value.definition,
    version: loaded.value.draft,
    nodes: loaded.value.nodes,
    edges: loaded.value.edges,
    roleBindings: loaded.value.roleBindings,
  }, baseline);
  const latestReview = await new WorkflowDefinitionRepository(sql).loadLatestReview(
    loaded.value.draft.id,
    Number(loaded.value.draft.revision),
  );

  return (
    <WorkflowEditorShell
      workflowName={loaded.value.definition.name}
      revision={loaded.value.draft.revision}
      initialMetadata={{
        definitionId: loaded.value.definition.id,
        name: loaded.value.definition.name,
        slug: loaded.value.definition.slug,
        description: loaded.value.definition.description,
        category: loaded.value.definition.category ?? "other",
        tags: loaded.value.definition.tags ?? [],
        catalogDescription: loaded.value.definition.catalogDescription ?? "",
        costModel: loaded.value.definition.costModel ?? { baseCost: 0, currency: "EUR", description: "" },
        ownerUserId: loaded.value.definition.ownerUserId,
        scope: {
          tenant: loaded.value.definition.tenant,
          businessUnit: loaded.value.definition.businessUnit,
          clientIds: loaded.value.definition.clientIds,
        },
      }}
      catalog={catalog}
      dataCatalog={dataCatalog}
      changeRequestCatalog={changeRequestCatalog}
      roleBindings={loaded.value.roleBindings.map((binding) => ({
        workflowRole: binding.workflowRole,
        identityGroup: binding.identityGroup,
        permissions: binding.permissions as ("workflow:start" | "workflow:tasks:execute" | "workflow:approve")[],
        tenant: binding.tenant,
        businessUnit: binding.businessUnit,
        ...(binding.clientIds ? { clientIds: binding.clientIds } : {}),
      }))}
      initialNodes={initialNodes}
      initialEdges={initialEdges}
      reviewDiff={reviewDiff}
      initialReviewDecision={latestReview?.decision ?? null}
    />
  );
}
