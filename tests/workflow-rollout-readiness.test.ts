import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  WORKFLOW_ROLLOUT_REQUIRED_SIGNOFFS,
  evaluateWorkflowRolloutReadiness,
  type WorkflowRolloutReadinessInput,
} from "@/lib/workflow-studio/rollout-readiness";

const greenInput: WorkflowRolloutReadinessInput = {
  pilotClients: 2,
  pilotProcesses: 2,
  startedInstances: 12,
  completedInstances: 12,
  failedInstances: 0,
  needsInterventionInstances: 0,
  openCriticalIncidents: 0,
  openHighSecurityFindings: 0,
  openCriticalSecurityFindings: 0,
  independentSecurityReviewCompleted: true,
  operatingDocsReady: true,
  cutoverAuditOk: true,
  trainingCompletedUsers: 6,
  requiredTrainingUsers: 6,
  usabilityTasksPassed: 18,
  usabilityTasksTotal: 20,
  signoffs: WORKFLOW_ROLLOUT_REQUIRED_SIGNOFFS.map((role) => ({
    role,
    approvedBy: `${role}@example.test`,
    approvedAt: "2026-08-11T10:00:00.000Z",
  })),
};

describe("workflow rollout readiness", () => {
  it("passes G4 when pilot metrics, security review, docs, cutover, training and sign-offs are complete", () => {
    expect(evaluateWorkflowRolloutReadiness(greenInput)).toMatchObject({
      ok: true,
      completionRate: 1,
      runtimeFailureRate: 0,
      usabilityPassRate: 0.9,
      missingSignoffs: [],
      issues: [],
    });
  });

  it("blocks broad rollout when findings, cutover or sign-offs are missing", () => {
    const result = evaluateWorkflowRolloutReadiness({
      ...greenInput,
      completedInstances: 8,
      failedInstances: 1,
      needsInterventionInstances: 1,
      openHighSecurityFindings: 1,
      independentSecurityReviewCompleted: false,
      cutoverAuditOk: false,
      trainingCompletedUsers: 4,
      signoffs: greenInput.signoffs.filter((signoff) => signoff.role !== "security"),
    });

    expect(result.ok).toBe(false);
    expect(result.missingSignoffs).toEqual(["security"]);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "completion_rate_below_target",
      "runtime_failures_above_target",
      "security_review_missing",
      "security_findings_open",
      "cutover_audit_failed",
      "training_incomplete",
      "signoff_missing",
    ]));
  });

  it("guards the pilot and rollout dossier", () => {
    const dossier = readFileSync("documentation/workflow-studio/workflow-pilot-rollout.md", "utf8");
    const handbook = readFileSync("documentation/workflow-studio/README.md", "utf8");
    const index = readFileSync("documentation/architecture/README.md", "utf8");

    for (const term of ["Pilot scope", "Succescriteria", "Meetplan", "Rollback", "Sign-off", "Businessunit-uitrol"]) {
      expect(dossier).toContain(term);
    }
    expect(handbook).toContain("workflow-pilot-rollout.md");
    expect(index).toContain("../workflow-studio/workflow-pilot-rollout.md");
  });
});
