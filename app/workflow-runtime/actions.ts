"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createWorkflowRuntimeTrackingChangeRequest, sql } from "@/lib/db";
import { getFeatureFlagSnapshot } from "@/lib/feature-flags";
import { getIdentityContext } from "@/lib/identity/request";
import { authorizeWorkflowPermission } from "@/lib/workflow-studio-authorization";
import { WorkflowDefinitionRepository } from "@/lib/workflow-studio/definition-repository";
import { WorkflowRuntimeEngine } from "@/lib/workflow-studio/runtime-engine";
import { parseWorkflowRuntimeFormData } from "@/lib/workflow-studio/runtime-form";
import { PostgresWorkflowRuntimeStore } from "@/lib/workflow-studio/runtime-postgres-store";
import { WorkflowRuntimeStartService } from "@/lib/workflow-studio/runtime-start-service";
import { decideWorkflowRuntimeCutover } from "@/lib/workflow-studio/runtime-cutover";

export type StartWorkflowRuntimeState = Readonly<{
  success: boolean;
  code: string;
  message: string;
  instanceId?: string;
  deduplicated?: boolean;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
}>;

const requestSchema = z.object({
  workflowVersionId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  correlationId: z.string().uuid(),
});

const retryNodeSchema = z.object({
  instanceId: z.string().uuid(),
  nodeInstanceId: z.string().uuid(),
  expectedStatus: z.enum(["failed", "needs_intervention"]),
});

export async function startWorkflowRuntimeAction(
  _previous: StartWorkflowRuntimeState,
  formData: FormData,
): Promise<StartWorkflowRuntimeState> {
  const flags = getFeatureFlagSnapshot();
  if (!flags["workflow_runtime.start"]) {
    return { success: false, code: "feature_disabled", message: "Het starten van Studio-workflows is nog niet ingeschakeld." };
  }
  if (!sql) return { success: false, code: "database_unavailable", message: "De workflowdatabase is niet beschikbaar." };
  const request = requestSchema.safeParse({
    workflowVersionId: formData.get("workflowVersionId"),
    idempotencyKey: formData.get("idempotencyKey"),
    correlationId: formData.get("correlationId"),
  });
  if (!request.success) return { success: false, code: "invalid_request", message: "De startaanvraag is ongeldig of verlopen." };

  const identity = await getIdentityContext();
  const service = new WorkflowRuntimeStartService(
    new WorkflowDefinitionRepository(sql),
    new WorkflowRuntimeEngine(new PostgresWorkflowRuntimeStore(sql)),
  );
  const prepared = await service.prepare(identity, request.data.workflowVersionId);
  if (!prepared.ok) return { success: false, code: prepared.code, message: prepared.message };
  const cutover = decideWorkflowRuntimeCutover({
    definitionId: prepared.value.definitionId,
    versionId: prepared.value.workflowVersionId,
  }, { globalRuntimeStartEnabled: flags["workflow_runtime.start"] });
  if (cutover.mode !== "runtime") {
    return {
      success: false,
      code: "classic_fallback",
      message: "Deze workflowversie staat nog op classic of is teruggerold; gebruik de klassieke aanvraagroute.",
    };
  }
  const parsedForm = parseWorkflowRuntimeFormData(prepared.value.forms, formData);
  if (!parsedForm.success) {
    return {
      success: false,
      code: "validation_failed",
      message: parsedForm.message,
      fieldErrors: parsedForm.fieldErrors,
    };
  }

  try {
    const occurredAt = new Date().toISOString();
    const started = await service.start(identity, {
      ...request.data,
      values: parsedForm.values,
      variables: parsedForm.variables,
      occurredAt,
    });
    if (!started.ok) return { success: false, code: started.code, message: started.message };
    if (!started.value.deduplicated) {
      try {
        await createWorkflowRuntimeTrackingChangeRequest({
          workflowInstanceId: started.value.instance.instanceId,
          workflowVersionId: prepared.value.workflowVersionId,
          definitionId: prepared.value.definitionId,
          slug: prepared.value.slug,
          name: prepared.value.name,
          description: prepared.value.description,
          catalogDescription: prepared.value.catalogDescription,
          category: prepared.value.category,
          costModel: prepared.value.costModel,
          forms: prepared.value.forms,
          values: parsedForm.values,
          clientIds: prepared.value.scope.clientIds ?? null,
          requestedBy: identity.userId,
          occurredAt,
        });
      } catch {
        // Runtime is the source of truth. Legacy change_requests tracking is
        // best-effort for existing dashboards during the cutover.
      }
    }
    return {
      success: true,
      code: "started",
      message: started.value.deduplicated
        ? "Deze aanvraag was al gestart; de bestaande instance is teruggegeven."
        : "De workflowaanvraag is gestart.",
      instanceId: started.value.instance.instanceId,
      deduplicated: started.value.deduplicated,
    };
  } catch (error) {
    return {
      success: false,
      code: "start_failed",
      message: error instanceof Error ? error.message : "De workflow kon niet worden gestart.",
    };
  }
}

export async function retryWorkflowNodeAction(formData: FormData) {
  const parsed = retryNodeSchema.safeParse({
    instanceId: formData.get("instanceId"),
    nodeInstanceId: formData.get("nodeInstanceId"),
    expectedStatus: formData.get("expectedStatus"),
  });
  if (!parsed.success) redirect("/workflow-runtime?error=ongeldige-retry");
  const { instanceId, nodeInstanceId, expectedStatus } = parsed.data;
  const back = `/workflow-runtime/${instanceId}`;
  if (!getFeatureFlagSnapshot()["workflow_runtime.start"]) redirect(`${back}?error=runtime-uitgeschakeld`);
  if (!sql) redirect(`${back}?error=database-niet-beschikbaar`);
  const identity = await getIdentityContext();
  const permission = authorizeWorkflowPermission(identity, "workflow:manage");
  if (!permission.authorized) redirect(`${back}?error=${encodeURIComponent(permission.message)}`);
  try {
    await new WorkflowRuntimeEngine(new PostgresWorkflowRuntimeStore(sql)).execute({
      type: "retry_node",
      commandId: randomUUID(),
      instanceId,
      nodeInstanceId,
      expectedStatus,
      nextNodeInstanceId: randomUUID(),
      mode: "manual",
      reason: "Handmatige retry vanuit runtime detail.",
      actor: { type: "user", id: identity.userId, ...(identity.sessionId ? { sessionId: identity.sessionId } : {}) },
      correlationId: randomUUID(),
      occurredAt: new Date().toISOString(),
    });
    redirect(`${back}?notice=node-retry-gepland`);
  } catch (error) {
    redirect(`${back}?error=${encodeURIComponent(error instanceof Error ? error.message : "Retry mislukt")}`);
  }
}
