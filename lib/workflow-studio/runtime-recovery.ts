import { randomUUID } from "node:crypto";

import type { IdentityContext } from "@/lib/identity/types";
import { authorizeWorkflowAction, authorizeWorkflowPermission } from "@/lib/workflow-studio-authorization";
import {
  WorkflowRuntimeEngine,
  WorkflowRuntimeEngineError,
  type WorkflowEngineEvent,
  type WorkflowEngineResult,
  type WorkflowRuntimeInstanceRecord,
  type WorkflowRuntimeNodeRecord,
  type WorkflowRuntimeStore,
} from "@/lib/workflow-studio/runtime-engine";
import type { WorkflowRuntimeActor } from "@/lib/workflow-studio/runtime-state-machine";

export type WorkflowRecoveryAction = "manual_retry" | "skip_node" | "terminate_instance" | "compensate_node";

export type WorkflowRecoveryResult =
  | { ok: true; value: WorkflowEngineResult; recoveryEvent: WorkflowEngineEvent | null }
  | { ok: false; code: "permission_denied" | "scope_denied" | "instance_not_found" | "node_not_found" | "not_recoverable" | "runtime_error"; message: string };

export type WorkflowCompensationPlan = Readonly<{
  nodeInstanceId: string;
  nodeKey: string;
  blockType: string;
  compensatable: boolean;
  handlerId?: string;
  reason: string;
}>;

const COMPENSATION_HANDLERS: Readonly<Record<string, string>> = Object.freeze({
  integration: "workflow.integration.compensate.v1",
  notification: "workflow.notification.compensate.v1",
  change_request: "workflow.change_request.compensate.v1",
});

function ok(value: WorkflowEngineResult, recoveryEvent: WorkflowEngineEvent | null): WorkflowRecoveryResult {
  return { ok: true, value, recoveryEvent };
}

function fail(code: Exclude<WorkflowRecoveryResult, { ok: true }>["code"], message: string): WorkflowRecoveryResult {
  return { ok: false, code, message };
}

function actorFromIdentity(identity: IdentityContext): WorkflowRuntimeActor {
  return {
    type: "user",
    id: identity.userId,
    ...(identity.sessionId ? { sessionId: identity.sessionId } : {}),
  };
}

function compensationPlan(node: WorkflowRuntimeNodeRecord): WorkflowCompensationPlan {
  const handlerId = COMPENSATION_HANDLERS[node.blockType];
  if (!handlerId) {
    return Object.freeze({
      nodeInstanceId: node.nodeInstanceId,
      nodeKey: node.nodeKey,
      blockType: node.blockType,
      compensatable: false,
      reason: "Voor dit blocktype is geen veilige compensation handler geregistreerd.",
    });
  }
  return Object.freeze({
    nodeInstanceId: node.nodeInstanceId,
    nodeKey: node.nodeKey,
    blockType: node.blockType,
    compensatable: true,
    handlerId,
    reason: "Compensatie is toegestaan via een allowlisted handler en wordt via audit gevolgd.",
  });
}

function isRetryableNodeStatus(status: WorkflowRuntimeNodeRecord["status"]): status is "failed" | "needs_intervention" {
  return status === "failed" || status === "needs_intervention";
}

function isTerminableInstanceStatus(
  status: WorkflowRuntimeInstanceRecord["status"],
): status is "pending" | "running" | "waiting" | "needs_intervention" {
  return status === "pending" || status === "running" || status === "waiting" || status === "needs_intervention";
}

export class WorkflowRuntimeRecoveryService {
  constructor(
    private readonly store: WorkflowRuntimeStore,
    private readonly engine = new WorkflowRuntimeEngine(store),
  ) {}

  private async authorize(identity: IdentityContext, instanceId: string): Promise<WorkflowRecoveryResult | null> {
    const permission = authorizeWorkflowPermission(identity, "workflow:manage");
    if (!permission.authorized) return fail("permission_denied", permission.message);
    return this.store.transaction(async (tx) => {
      const instance = await tx.lockInstance(instanceId);
      if (!instance) return fail("instance_not_found", "Workflowinstance bestaat niet.");
      const scope = authorizeWorkflowAction(identity, "workflow:manage", {
        tenant: instance.tenant,
        businessUnit: instance.businessUnit,
        ...(instance.clientIds ? { clientIds: instance.clientIds } : {}),
      });
      return scope.authorized ? null : fail("scope_denied", scope.message);
    });
  }

  async planCompensation(input: Readonly<{ nodeInstanceId: string }>): Promise<WorkflowCompensationPlan | null> {
    return this.store.transaction(async (tx) => {
      const node = await tx.loadNode(input.nodeInstanceId);
      return node ? compensationPlan(node) : null;
    });
  }

  private async loadNodeInInstance(input: Readonly<{ instanceId: string; nodeInstanceId: string }>): Promise<WorkflowRuntimeNodeRecord | null> {
    return this.store.transaction(async (tx) => {
      const node = await tx.loadNode(input.nodeInstanceId);
      return node?.instanceId === input.instanceId ? node : null;
    });
  }

  private async loadInstance(instanceId: string): Promise<WorkflowRuntimeInstanceRecord | null> {
    return this.store.transaction((tx) => tx.lockInstance(instanceId));
  }

  private async loadCommandEvent(instanceId: string, commandId: string): Promise<WorkflowEngineEvent | null> {
    return this.store.transaction((tx) => tx.findCommandEvent(instanceId, commandId));
  }

  private async appendRecoveryEvent(input: Readonly<{
    instanceId: string;
    nodeInstanceId?: string;
    commandId: string;
    action: WorkflowRecoveryAction;
    incidentNote: string;
    actor: WorkflowRuntimeActor;
    correlationId: string;
    occurredAt: string;
    details?: Readonly<Record<string, unknown>>;
  }>): Promise<WorkflowEngineEvent | null> {
    return this.store.transaction(async (tx) => {
      const existing = await tx.findCommandEvent(input.instanceId, `${input.commandId}:recovery-event`);
      if (existing) return null;
      return tx.appendEvent({
        instanceId: input.instanceId,
        ...(input.nodeInstanceId ? { nodeInstanceId: input.nodeInstanceId } : {}),
        eventType: "workflow.recovery.action_recorded",
        eventVersion: 1,
        payload: {
          action: input.action,
          incidentNote: input.incidentNote,
          ...(input.details ? { details: input.details } : {}),
        },
        actor: input.actor,
        idempotencyKey: `${input.commandId}:recovery-event`,
        correlationId: input.correlationId,
        causationId: input.commandId,
        occurredAt: input.occurredAt,
      });
    });
  }

  async manualRetry(identity: IdentityContext, input: Readonly<{
    instanceId: string;
    nodeInstanceId: string;
    commandId: string;
    correlationId: string;
    occurredAt: string;
    incidentNote: string;
  }>): Promise<WorkflowRecoveryResult> {
    const access = await this.authorize(identity, input.instanceId);
    if (access) return access;
    const duplicate = await this.loadCommandEvent(input.instanceId, input.commandId);
    const node = duplicate ? null : await this.loadNodeInInstance(input);
    if (!duplicate && !node) return fail("node_not_found", "Node bestaat niet binnen deze workflowinstance.");
    if (node && !isRetryableNodeStatus(node.status)) {
      return fail("not_recoverable", `Node met status '${node.status}' kan niet handmatig opnieuw gestart worden.`);
    }
    const expectedStatus: "failed" | "needs_intervention" = node && isRetryableNodeStatus(node.status) ? node.status : "needs_intervention";
    const actor = actorFromIdentity(identity);
    try {
      const result = await this.engine.execute({
        type: "retry_node",
        commandId: input.commandId,
        instanceId: input.instanceId,
        nodeInstanceId: input.nodeInstanceId,
        expectedStatus,
        actor,
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
        nextNodeInstanceId: randomUUID(),
        mode: "manual",
        reason: input.incidentNote,
      });
      const recoveryEvent = await this.appendRecoveryEvent({ ...input, action: "manual_retry", actor });
      return ok(result, recoveryEvent);
    } catch (error) {
      if (error instanceof WorkflowRuntimeEngineError) return fail("runtime_error", error.message);
      throw error;
    }
  }

  async skipNode(identity: IdentityContext, input: Readonly<{
    instanceId: string;
    nodeInstanceId: string;
    commandId: string;
    correlationId: string;
    occurredAt: string;
    incidentNote: string;
  }>): Promise<WorkflowRecoveryResult> {
    const access = await this.authorize(identity, input.instanceId);
    if (access) return access;
    const duplicate = await this.loadCommandEvent(input.instanceId, input.commandId);
    const node = duplicate ? null : await this.loadNodeInInstance(input);
    if (!duplicate && !node) return fail("node_not_found", "Node bestaat niet binnen deze workflowinstance.");
    if (node && node.status !== "ready") return fail("not_recoverable", `Alleen ready nodes kunnen bevoegd worden overgeslagen; huidige status is '${node.status}'.`);
    const expectedStatus: "ready" = "ready";
    const actor = actorFromIdentity(identity);
    try {
      const result = await this.engine.execute({
        type: "skip_node",
        commandId: input.commandId,
        instanceId: input.instanceId,
        nodeInstanceId: input.nodeInstanceId,
        expectedStatus,
        actor,
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
        reason: input.incidentNote,
      });
      const recoveryEvent = await this.appendRecoveryEvent({ ...input, action: "skip_node", actor });
      return ok(result, recoveryEvent);
    } catch (error) {
      if (error instanceof WorkflowRuntimeEngineError) return fail("runtime_error", error.message);
      throw error;
    }
  }

  async terminateInstance(identity: IdentityContext, input: Readonly<{
    instanceId: string;
    commandId: string;
    correlationId: string;
    occurredAt: string;
    incidentNote: string;
  }>): Promise<WorkflowRecoveryResult> {
    const access = await this.authorize(identity, input.instanceId);
    if (access) return access;
    const duplicate = await this.loadCommandEvent(input.instanceId, input.commandId);
    const instance = duplicate ? null : await this.loadInstance(input.instanceId);
    if (!duplicate && !instance) return fail("instance_not_found", "Workflowinstance bestaat niet.");
    if (instance && !isTerminableInstanceStatus(instance.status)) {
      return fail("not_recoverable", `Workflowinstance met status '${instance.status}' kan niet handmatig beëindigd worden.`);
    }
    const expectedStatus: "pending" | "running" | "waiting" | "needs_intervention" =
      instance && isTerminableInstanceStatus(instance.status) ? instance.status : "running";
    const actor = actorFromIdentity(identity);
    try {
      const result = await this.engine.execute({
        type: "cancel_instance",
        commandId: input.commandId,
        instanceId: input.instanceId,
        expectedStatus,
        actor,
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
        reason: input.incidentNote,
      });
      const recoveryEvent = await this.appendRecoveryEvent({ ...input, action: "terminate_instance", actor });
      return ok(result, recoveryEvent);
    } catch (error) {
      if (error instanceof WorkflowRuntimeEngineError) return fail("runtime_error", error.message);
      throw error;
    }
  }

  async recordCompensation(identity: IdentityContext, input: Readonly<{
    instanceId: string;
    nodeInstanceId: string;
    commandId: string;
    correlationId: string;
    occurredAt: string;
    incidentNote: string;
  }>): Promise<WorkflowRecoveryResult> {
    const access = await this.authorize(identity, input.instanceId);
    if (access) return access;
    const plan = await this.planCompensation({ nodeInstanceId: input.nodeInstanceId });
    if (!plan) return fail("node_not_found", "Node bestaat niet.");
    if (!plan.compensatable) return fail("not_recoverable", plan.reason);
    const actor = actorFromIdentity(identity);
    const recoveryEvent = await this.appendRecoveryEvent({
      ...input,
      action: "compensate_node",
      actor,
      details: { compensation: plan },
    });
    return ok({
      instance: await this.store.transaction(async (tx) => {
        const instance = await tx.lockInstance(input.instanceId);
        if (!instance) throw new WorkflowRuntimeEngineError("instance_not_found", "Workflowinstance bestaat niet.");
        return instance;
      }),
      state: await this.store.transaction(async (tx) => {
        const node = await tx.loadNode(input.nodeInstanceId);
        if (!node) throw new WorkflowRuntimeEngineError("node_not_found", "Node bestaat niet.");
        return node;
      }),
      activatedNodes: [],
      events: recoveryEvent ? [recoveryEvent] : [],
      variables: [],
      deduplicated: recoveryEvent === null,
    }, recoveryEvent);
  }
}
