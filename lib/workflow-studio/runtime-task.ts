import type { IdentityContext } from "@/lib/identity/types";
import { authorizeWorkflowAction, authorizeWorkflowPermission, type WorkflowDataScope } from "@/lib/workflow-studio-authorization";
import {
  WorkflowRuntimeEngine,
  WorkflowRuntimeEngineError,
  type WorkflowRuntimeStore,
  type WorkflowTaskRecord,
  type WorkflowTaskStatus,
} from "@/lib/workflow-studio/runtime-engine";
import {
  workflowApprovalConfigurationSchema,
  workflowApprovalAggregationModeSchema,
  workflowApprovalDecisionSchema,
  workflowApprovalRoleCombinationSchema,
  workflowRoleTaskConfigurationSchema,
  type WorkflowApprovalAggregationMode,
  type WorkflowApprovalDecision,
  type WorkflowApprovalRoleCombination,
} from "@/lib/workflow-studio/runtime-human-schema";
import type { WorkflowRuntimeActor } from "@/lib/workflow-studio/runtime-state-machine";

export {
  workflowApprovalConfigurationSchema,
  workflowApprovalAggregationModeSchema,
  workflowApprovalDecisionSchema,
  workflowApprovalRoleCombinationSchema,
  workflowRoleTaskConfigurationSchema,
  type WorkflowApprovalAggregationMode,
  type WorkflowApprovalDecision,
  type WorkflowApprovalRoleCombination,
};

export type WorkflowTaskServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "permission_denied" | "scope_denied" | "task_not_found" | "task_not_claimable" | "task_not_completable" | "maker_checker_conflict" | "comment_required" | "approval_policy_violation" | "runtime_error"; message: string };

export type WorkflowTaskListFilters = Readonly<{
  statuses?: readonly WorkflowTaskStatus[];
  due?: "all" | "overdue" | "upcoming";
  now?: string;
}>;

function ok<T>(value: T): WorkflowTaskServiceResult<T> {
  return { ok: true, value };
}

function fail<T>(code: Exclude<WorkflowTaskServiceResult<T>, { ok: true }>["code"], message: string): WorkflowTaskServiceResult<T> {
  return { ok: false, code, message };
}

function taskScope(task: WorkflowTaskRecord): WorkflowDataScope {
  return {
    tenant: task.tenant,
    businessUnit: task.businessUnit,
    ...(task.clientIds ? { clientIds: task.clientIds } : {}),
  };
}

function actorFromIdentity(identity: IdentityContext): WorkflowRuntimeActor {
  return {
    type: "user",
    id: identity.userId,
    ...(identity.sessionId ? { sessionId: identity.sessionId } : {}),
  };
}

function canUseTask(identity: IdentityContext, task: WorkflowTaskRecord, permissionId?: "workflow:tasks:execute" | "workflow:approve"): WorkflowTaskServiceResult<true> {
  const requiredPermission = permissionId ?? (task.permissions.includes("workflow:approve") ? "workflow:approve" : "workflow:tasks:execute");
  const permission = authorizeWorkflowPermission(identity, requiredPermission);
  if (!permission.authorized) return fail("permission_denied", permission.message);
  if (!identity.groups.includes(task.assigneeGroup)) {
    return fail("permission_denied", "Deze taak is toegewezen aan een rol waar de gebruiker geen lid van is.");
  }
  if (!task.permissions.includes(requiredPermission)) {
    return fail("permission_denied", "De taakrol heeft niet de vereiste runtime-capability.");
  }
  const scope = authorizeWorkflowAction(identity, requiredPermission, taskScope(task));
  return scope.authorized ? ok(true) : fail("scope_denied", scope.message);
}

function visibleByDue(task: WorkflowTaskRecord, filters: WorkflowTaskListFilters): boolean {
  if (!filters.due || filters.due === "all") return true;
  if (!task.deadlineAt) return filters.due === "upcoming";
  const now = Date.parse(filters.now ?? new Date().toISOString());
  const deadline = Date.parse(task.deadlineAt);
  if (!Number.isFinite(now) || !Number.isFinite(deadline)) return true;
  return filters.due === "overdue" ? deadline < now : deadline >= now;
}

export class WorkflowTaskService {
  constructor(
    private readonly store: WorkflowRuntimeStore,
    private readonly engine = new WorkflowRuntimeEngine(store),
  ) {}

  async listMine(identity: IdentityContext, filters: WorkflowTaskListFilters = {}): Promise<WorkflowTaskServiceResult<readonly WorkflowTaskRecord[]>> {
    const taskPermission = authorizeWorkflowPermission(identity, "workflow:tasks:execute");
    const approvalPermission = authorizeWorkflowPermission(identity, "workflow:approve");
    if (!taskPermission.authorized && !approvalPermission.authorized) return fail("permission_denied", taskPermission.message);
    const statuses = filters.statuses ?? ["open", "claimed"];
    const tasks = await this.store.transaction((tx) => tx.listTasksForGroups(identity.groups, statuses));
    return ok(tasks.filter((task) => canUseTask(identity, task).ok && visibleByDue(task, filters)));
  }

  async claim(identity: IdentityContext, input: Readonly<{ taskId: string; occurredAt: string }>): Promise<WorkflowTaskServiceResult<WorkflowTaskRecord>> {
    return this.store.transaction(async (tx) => {
      const task = await tx.loadTask(input.taskId);
      if (!task) return fail("task_not_found", "Workflowtaak bestaat niet.");
      const access = canUseTask(identity, task);
      if (!access.ok) return access;
      if (task.status === "claimed" && task.claimedByUserId === identity.userId) return ok(task);
      if (task.status !== "open") return fail("task_not_claimable", "Alleen open taken kunnen worden geclaimd.");
      return ok(await tx.updateTask({
        taskId: task.id,
        status: "claimed",
        claimedByUserId: identity.userId,
        claimedAt: input.occurredAt,
      }));
    });
  }

  async reassign(identity: IdentityContext, input: Readonly<{ taskId: string; assigneeUserId?: string; occurredAt: string }>): Promise<WorkflowTaskServiceResult<WorkflowTaskRecord>> {
    return this.store.transaction(async (tx) => {
      const task = await tx.loadTask(input.taskId);
      if (!task) return fail("task_not_found", "Workflowtaak bestaat niet.");
      const access = canUseTask(identity, task);
      if (!access.ok) return access;
      if (task.status !== "open" && task.status !== "claimed") return fail("task_not_claimable", "Alleen open of geclaimde taken kunnen worden herverdeeld.");
      return ok(await tx.updateTask({
        taskId: task.id,
        status: input.assigneeUserId ? "claimed" : "open",
        ...(input.assigneeUserId ? { claimedByUserId: input.assigneeUserId, claimedAt: input.occurredAt } : {}),
      }));
    });
  }

  async complete(identity: IdentityContext, input: Readonly<{
    taskId: string;
    commandId: string;
    correlationId: string;
    occurredAt: string;
    formData: Readonly<Record<string, unknown>>;
    comment?: string;
  }>): Promise<WorkflowTaskServiceResult<WorkflowTaskRecord>> {
    const access = await this.store.transaction(async (tx) => {
      const task = await tx.loadTask(input.taskId);
      if (!task) return fail<WorkflowTaskRecord>("task_not_found", "Workflowtaak bestaat niet.");
      const decision = canUseTask(identity, task);
      if (!decision.ok) return decision;
      if (task.status !== "claimed" || task.claimedByUserId !== identity.userId) {
        return fail<WorkflowTaskRecord>("task_not_completable", "Alleen de huidige claimhouder kan deze taak voltooien.");
      }
      return ok(task);
    });
    if (!access.ok) return access;
    try {
      await this.engine.completeRoleTask({
        taskId: input.taskId,
        commandId: input.commandId,
        actor: actorFromIdentity(identity),
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
        formData: input.formData,
        ...(input.comment ? { comment: input.comment } : {}),
      });
      const refreshed = await this.store.transaction((tx) => tx.loadTask(input.taskId));
      return refreshed ? ok(refreshed) : fail("task_not_found", "Workflowtaak bestaat niet meer.");
    } catch (error) {
      if (error instanceof WorkflowRuntimeEngineError) return fail("runtime_error", error.message);
      throw error;
    }
  }

  async decideApproval(identity: IdentityContext, input: Readonly<{
    taskId: string;
    commandId: string;
    correlationId: string;
    occurredAt: string;
    decision: WorkflowApprovalDecision;
    comment?: string;
  }>): Promise<WorkflowTaskServiceResult<WorkflowTaskRecord>> {
    const access = await this.store.transaction(async (tx) => {
      const task = await tx.loadTask(input.taskId);
      if (!task) return fail<WorkflowTaskRecord>("task_not_found", "Workflowtaak bestaat niet.");
      const decision = canUseTask(identity, task, "workflow:approve");
      if (!decision.ok) return decision;
      if (task.status !== "claimed" || task.claimedByUserId !== identity.userId) {
        return fail<WorkflowTaskRecord>("task_not_completable", "Alleen de huidige claimhouder kan dit besluit vastleggen.");
      }
      return ok(task);
    });
    if (!access.ok) return access;
    try {
      await this.engine.completeApprovalTask({
        taskId: input.taskId,
        commandId: input.commandId,
        actor: actorFromIdentity(identity),
        correlationId: input.correlationId,
        occurredAt: input.occurredAt,
        decision: input.decision,
        ...(input.comment ? { comment: input.comment } : {}),
      });
      const refreshed = await this.store.transaction((tx) => tx.loadTask(input.taskId));
      return refreshed ? ok(refreshed) : fail("task_not_found", "Workflowtaak bestaat niet meer.");
    } catch (error) {
      if (error instanceof WorkflowRuntimeEngineError) {
        if (error.code === "maker_checker_conflict") return fail("maker_checker_conflict", error.message);
        if (error.code === "comment_required") return fail("comment_required", error.message);
        if (error.code === "approval_policy_violation") return fail("approval_policy_violation", error.message);
        return fail("runtime_error", error.message);
      }
      throw error;
    }
  }
}
