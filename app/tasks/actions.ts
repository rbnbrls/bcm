"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { sql } from "@/lib/db";
import { getIdentityContext } from "@/lib/identity/request";
import { PostgresWorkflowRuntimeStore } from "@/lib/workflow-studio/runtime-postgres-store";
import { WorkflowTaskService } from "@/lib/workflow-studio/runtime-task";
import { workflowApprovalDecisionSchema } from "@/lib/workflow-studio/runtime-human-schema";

function taskService(): WorkflowTaskService | null {
  return sql ? new WorkflowTaskService(new PostgresWorkflowRuntimeStore(sql)) : null;
}

function redirectWith(code: string, message?: string): never {
  const params = new URLSearchParams();
  params.set(code === "completed" || code === "claimed" || code === "released" ? "notice" : "error", message ?? code);
  redirect(`/tasks?${params.toString()}`);
}

export async function claimWorkflowTaskAction(formData: FormData) {
  const service = taskService();
  if (!service) redirectWith("database_unavailable", "De workflowdatabase is niet beschikbaar.");
  const taskId = String(formData.get("taskId") ?? "");
  const result = await service.claim(await getIdentityContext(), { taskId, occurredAt: new Date().toISOString() });
  if (!result.ok) redirectWith(result.code, result.message);
  revalidatePath("/tasks");
  redirectWith("claimed", "Taak geclaimd.");
}

export async function releaseWorkflowTaskAction(formData: FormData) {
  const service = taskService();
  if (!service) redirectWith("database_unavailable", "De workflowdatabase is niet beschikbaar.");
  const taskId = String(formData.get("taskId") ?? "");
  const result = await service.reassign(await getIdentityContext(), { taskId, occurredAt: new Date().toISOString() });
  if (!result.ok) redirectWith(result.code, result.message);
  revalidatePath("/tasks");
  redirectWith("released", "Taak vrijgegeven.");
}

export async function completeWorkflowTaskAction(formData: FormData) {
  const service = taskService();
  if (!service) redirectWith("database_unavailable", "De workflowdatabase is niet beschikbaar.");
  const taskId = String(formData.get("taskId") ?? "");
  const rawFormData = String(formData.get("formDataJson") ?? "{}").trim() || "{}";
  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(rawFormData) as unknown;
    parsed = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    redirectWith("invalid_form_data", "Taakuitvoer moet geldige JSON zijn.");
  }
  const result = await service.complete(await getIdentityContext(), {
    taskId,
    commandId: randomUUID(),
    correlationId: randomUUID(),
    occurredAt: new Date().toISOString(),
    formData: parsed,
    comment: String(formData.get("comment") ?? "").trim() || undefined,
  });
  if (!result.ok) redirectWith(result.code, result.message);
  revalidatePath("/tasks");
  redirectWith("completed", "Taak voltooid.");
}

export async function decideWorkflowApprovalAction(formData: FormData) {
  const service = taskService();
  if (!service) redirectWith("database_unavailable", "De workflowdatabase is niet beschikbaar.");
  const taskId = String(formData.get("taskId") ?? "");
  const decision = workflowApprovalDecisionSchema.safeParse(formData.get("decision"));
  if (!decision.success) redirectWith("invalid_decision", "Het goedkeuringsbesluit is ongeldig.");
  const result = await service.decideApproval(await getIdentityContext(), {
    taskId,
    commandId: randomUUID(),
    correlationId: randomUUID(),
    occurredAt: new Date().toISOString(),
    decision: decision.data,
    comment: String(formData.get("comment") ?? "").trim() || undefined,
  });
  if (!result.ok) redirectWith(result.code, result.message);
  revalidatePath("/tasks");
  redirectWith("completed", "Goedkeuringsbesluit vastgelegd.");
}
