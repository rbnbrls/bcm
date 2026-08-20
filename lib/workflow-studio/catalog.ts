import type { IdentityContext } from "@/lib/identity/types";
import { getFeatureFlagSnapshot } from "@/lib/feature-flags";
import { getIdentityClientScope } from "@/lib/workflow-studio-authorization";
import type { WorkflowFormField } from "@/lib/workflow-studio/form-schema";
import {
  WorkflowDefinitionRepository,
  type SqlExecutor,
  type WorkflowDefinitionRow,
  type WorkflowNodeRow,
  type WorkflowVersionRow,
} from "@/lib/workflow-studio/definition-repository";
import { createWorkflowDefinitionService } from "@/lib/workflow-studio/definition-service";
import { loadWorkflowOverview } from "@/lib/workflow-studio/overview";
import { PostgresWorkflowRuntimeStore } from "@/lib/workflow-studio/runtime-postgres-store";
import { WorkflowRuntimeEngine } from "@/lib/workflow-studio/runtime-engine";
import {
  WorkflowRuntimeStartService,
  type WorkflowRuntimeStartModel,
} from "@/lib/workflow-studio/runtime-start-service";
import { decideWorkflowRuntimeCutover } from "@/lib/workflow-studio/runtime-cutover";

export type PublishedWorkflowCatalogItem = Readonly<{
  definition: WorkflowDefinitionRow;
  version: WorkflowVersionRow;
  startHref: string | null;
  startable: boolean;
  blockedReason?: string;
}>;

export type PublishedWorkflowCatalogDetail = PublishedWorkflowCatalogItem & Readonly<{
  startModel: WorkflowRuntimeStartModel | null;
  nodes: readonly WorkflowNodeRow[];
}>;

function sortCatalogItems(
  items: readonly PublishedWorkflowCatalogItem[],
): readonly PublishedWorkflowCatalogItem[] {
  return [...items].sort((left, right) => {
    const category = String(left.definition.category ?? "").localeCompare(String(right.definition.category ?? ""));
    if (category !== 0) return category;
    return left.definition.name.localeCompare(right.definition.name);
  });
}

export async function loadPublishedWorkflowCatalog(
  sql: SqlExecutor,
  identity: IdentityContext,
): Promise<readonly PublishedWorkflowCatalogItem[]> {
  const overview = await loadWorkflowOverview(createWorkflowDefinitionService(sql), identity);
  if (!overview.ok) return [];

  const flags = getFeatureFlagSnapshot();
  const repository = new WorkflowDefinitionRepository(sql);
  const startService = new WorkflowRuntimeStartService(
    repository,
    new WorkflowRuntimeEngine(new PostgresWorkflowRuntimeStore(sql)),
  );
  const items: PublishedWorkflowCatalogItem[] = [];
  for (const item of overview.value) {
    if (item.definition.status !== "published" || !item.published) continue;
    
    // Special handling for benchmark-wijziging workflow
    if (item.definition.slug === "benchmark-wijziging") {
      items.push({
        definition: item.definition,
        version: item.published,
        startable: flags["workflow_runtime.start"],
        startHref: flags["workflow_runtime.start"] ? `/change-catalog/benchmark-wijziging/${item.definition.id}` : null,
        blockedReason: flags["workflow_runtime.start"] 
          ? undefined 
          : "Workflow runtime is nog niet ingeschakeld. Neem contact op met de beheerder.",
      });
      continue;
    }
    
    const prepared = flags["workflow_runtime.start"]
      ? await startService.prepare(identity, item.published.id)
      : { ok: false as const, message: "Workflow runtime start is niet ingeschakeld." };
    const cutover = prepared.ok
      ? decideWorkflowRuntimeCutover(
        { definitionId: prepared.value.definitionId, versionId: prepared.value.workflowVersionId },
        { globalRuntimeStartEnabled: flags["workflow_runtime.start"] },
      )
      : { mode: "classic" };
    const startable = prepared.ok && cutover.mode === "runtime";
    items.push({
      definition: item.definition,
      version: item.published,
      startable,
      startHref: startable ? `/workflow-runtime/${item.published.id}/start` : null,
      ...(!startable ? { blockedReason: prepared.ok ? "Workflow runtime is niet actief voor deze versie." : prepared.message } : {}),
    });
  }
  return sortCatalogItems(items);
}

export async function loadPublishedWorkflowCatalogDetail(
  sql: SqlExecutor,
  identity: IdentityContext,
  idOrSlug: string,
): Promise<PublishedWorkflowCatalogDetail | null> {
  const items = await loadPublishedWorkflowCatalog(sql, identity);
  const item = items.find((candidate) => (
    candidate.definition.id === idOrSlug
    || candidate.definition.slug === idOrSlug
    || candidate.version.id === idOrSlug
  ));
  if (!item) return null;

  const repository = new WorkflowDefinitionRepository(sql);
  const snapshot = await repository.loadVersion(item.version.id);
  if (!snapshot) return null;
  const prepared = await new WorkflowRuntimeStartService(
    repository,
    new WorkflowRuntimeEngine(new PostgresWorkflowRuntimeStore(sql)),
  ).prepare(identity, item.version.id);
  return {
    ...item,
    startModel: prepared.ok ? prepared.value : null,
    nodes: snapshot.nodes,
  };
}

export function workflowCatalogClientIds(identity: IdentityContext, definition: WorkflowDefinitionRow): readonly string[] | null {
  const identityClients = getIdentityClientScope(identity);
  if (identityClients && definition.clientIds) {
    return identityClients.filter((clientId) => definition.clientIds?.includes(clientId));
  }
  return identityClients ?? definition.clientIds ?? null;
}

export function fieldTypeLabel(field: WorkflowFormField): string {
  const labels: Record<WorkflowFormField["type"], string> = {
    boolean: "Ja/Nee",
    currency: "Bedrag",
    date: "Datum",
    longtext: "Lange tekst",
    multiselect: "Meerdere keuzes",
    number: "Getal",
    select: "Keuzelijst",
    text: "Tekst",
  };
  return labels[field.type];
}
