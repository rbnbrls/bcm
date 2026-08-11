export type WorkflowRolloutSignoffRole =
  | "product_owner"
  | "security"
  | "operations"
  | "process_owner";

export type WorkflowRolloutSignoff = Readonly<{
  role: WorkflowRolloutSignoffRole;
  approvedBy: string;
  approvedAt: string;
  remarks?: string;
}>;

export type WorkflowRolloutReadinessInput = Readonly<{
  pilotClients: number;
  pilotProcesses: number;
  startedInstances: number;
  completedInstances: number;
  failedInstances: number;
  needsInterventionInstances: number;
  openCriticalIncidents: number;
  openHighSecurityFindings: number;
  openCriticalSecurityFindings: number;
  independentSecurityReviewCompleted: boolean;
  operatingDocsReady: boolean;
  cutoverAuditOk: boolean;
  trainingCompletedUsers: number;
  requiredTrainingUsers: number;
  usabilityTasksPassed: number;
  usabilityTasksTotal: number;
  signoffs: readonly WorkflowRolloutSignoff[];
}>;

export type WorkflowRolloutReadinessIssue = Readonly<{
  code:
    | "pilot_scope_empty"
    | "pilot_scope_too_large"
    | "insufficient_instances"
    | "completion_rate_below_target"
    | "runtime_failures_above_target"
    | "open_incidents"
    | "security_review_missing"
    | "security_findings_open"
    | "operating_docs_missing"
    | "cutover_audit_failed"
    | "training_incomplete"
    | "usability_failed"
    | "signoff_missing";
  message: string;
}>;

export type WorkflowRolloutReadinessEvaluation = Readonly<{
  ok: boolean;
  completionRate: number;
  runtimeFailureRate: number;
  usabilityPassRate: number;
  missingSignoffs: readonly WorkflowRolloutSignoffRole[];
  issues: readonly WorkflowRolloutReadinessIssue[];
}>;

export const WORKFLOW_ROLLOUT_REQUIRED_SIGNOFFS: readonly WorkflowRolloutSignoffRole[] = Object.freeze([
  "product_owner",
  "security",
  "operations",
  "process_owner",
]);

export const WORKFLOW_ROLLOUT_DEFAULT_THRESHOLDS = Object.freeze({
  minPilotClients: 1,
  maxPilotClients: 3,
  minPilotProcesses: 1,
  maxPilotProcesses: 3,
  minStartedInstances: 5,
  minCompletionRate: 0.9,
  maxRuntimeFailureRate: 0.05,
  minUsabilityPassRate: 0.9,
});

export function evaluateWorkflowRolloutReadiness(
  input: WorkflowRolloutReadinessInput,
): WorkflowRolloutReadinessEvaluation {
  const issues: WorkflowRolloutReadinessIssue[] = [];
  const completionRate = input.startedInstances > 0 ? input.completedInstances / input.startedInstances : 0;
  const runtimeFailureRate = input.startedInstances > 0
    ? (input.failedInstances + input.needsInterventionInstances) / input.startedInstances
    : 0;
  const usabilityPassRate = input.usabilityTasksTotal > 0 ? input.usabilityTasksPassed / input.usabilityTasksTotal : 0;

  if (input.pilotClients < WORKFLOW_ROLLOUT_DEFAULT_THRESHOLDS.minPilotClients || input.pilotProcesses < WORKFLOW_ROLLOUT_DEFAULT_THRESHOLDS.minPilotProcesses) {
    issues.push({ code: "pilot_scope_empty", message: "Pilot bevat geen client en proces." });
  }
  if (input.pilotClients > WORKFLOW_ROLLOUT_DEFAULT_THRESHOLDS.maxPilotClients || input.pilotProcesses > WORKFLOW_ROLLOUT_DEFAULT_THRESHOLDS.maxPilotProcesses) {
    issues.push({ code: "pilot_scope_too_large", message: "Pilot is groter dan de gecontroleerde scope." });
  }
  if (input.startedInstances < WORKFLOW_ROLLOUT_DEFAULT_THRESHOLDS.minStartedInstances) {
    issues.push({ code: "insufficient_instances", message: "Te weinig pilotinstances voor rolloutbesluit." });
  }
  if (completionRate < WORKFLOW_ROLLOUT_DEFAULT_THRESHOLDS.minCompletionRate) {
    issues.push({ code: "completion_rate_below_target", message: "Completion rate ligt onder de rolloutdrempel." });
  }
  if (runtimeFailureRate > WORKFLOW_ROLLOUT_DEFAULT_THRESHOLDS.maxRuntimeFailureRate) {
    issues.push({ code: "runtime_failures_above_target", message: "Runtime failure/intervention rate ligt boven de rolloutdrempel." });
  }
  if (input.openCriticalIncidents > 0) {
    issues.push({ code: "open_incidents", message: "Er staan kritieke incidenten open." });
  }
  if (!input.independentSecurityReviewCompleted) {
    issues.push({ code: "security_review_missing", message: "Onafhankelijke securityreview ontbreekt." });
  }
  if (input.openCriticalSecurityFindings > 0 || input.openHighSecurityFindings > 0) {
    issues.push({ code: "security_findings_open", message: "High/critical securitybevindingen staan open." });
  }
  if (!input.operatingDocsReady) {
    issues.push({ code: "operating_docs_missing", message: "Operating handbook/readiness-audit is niet groen." });
  }
  if (!input.cutoverAuditOk) {
    issues.push({ code: "cutover_audit_failed", message: "Actieve change types missen runtime cutoverkoppelingen." });
  }
  if (input.trainingCompletedUsers < input.requiredTrainingUsers) {
    issues.push({ code: "training_incomplete", message: "Niet alle pilotgebruikers hebben training afgerond." });
  }
  if (usabilityPassRate < WORKFLOW_ROLLOUT_DEFAULT_THRESHOLDS.minUsabilityPassRate) {
    issues.push({ code: "usability_failed", message: "Taakgebaseerde usabilitytest haalt de drempel niet." });
  }

  const approved = new Set(input.signoffs.map((signoff) => signoff.role));
  const missingSignoffs = WORKFLOW_ROLLOUT_REQUIRED_SIGNOFFS.filter((role) => !approved.has(role));
  for (const role of missingSignoffs) {
    issues.push({ code: "signoff_missing", message: `Sign-off ontbreekt voor ${role}.` });
  }

  return Object.freeze({
    ok: issues.length === 0,
    completionRate,
    runtimeFailureRate,
    usabilityPassRate,
    missingSignoffs: Object.freeze(missingSignoffs),
    issues: Object.freeze(issues),
  });
}
