export type WorkflowStudioOperatingDocument = Readonly<{
  id: string;
  path: string;
  title: string;
  requiredTerms: readonly string[];
}>;

export type WorkflowStudioOperatingDocsAudit = Readonly<{
  ok: boolean;
  checked: readonly string[];
  missing: readonly string[];
}>;

export const WORKFLOW_STUDIO_OPERATING_DOCUMENTS: readonly WorkflowStudioOperatingDocument[] = Object.freeze([
  {
    id: "author-guide",
    path: "documentation/workflow-studio/workflow-author-guide.md",
    title: "Workflow Studio Author Guide",
    requiredTerms: Object.freeze(["scope", "simulatie", "publicatie", "runtime"]),
  },
  {
    id: "block-reference",
    path: "documentation/workflow-studio/workflow-block-reference.md",
    title: "Workflow Studio Block Reference",
    requiredTerms: Object.freeze(["manual_start", "approval", "change_request", "integration"]),
  },
  {
    id: "governance-guide",
    path: "documentation/workflow-studio/workflow-governance-guide.md",
    title: "Workflow Studio Governance Guide",
    requiredTerms: Object.freeze(["vier-ogen", "policy", "segregation", "audit"]),
  },
  {
    id: "operations-runbook",
    path: "documentation/workflow-studio/workflow-operations-runbook.md",
    title: "Workflow Studio Operations Runbook",
    requiredTerms: Object.freeze(["dashboard", "outbox", "recovery", "SLO"]),
  },
  {
    id: "incident-procedure",
    path: "documentation/workflow-studio/workflow-incident-procedure.md",
    title: "Workflow Studio Incident Procedure",
    requiredTerms: Object.freeze(["severity", "RPO", "RTO", "rollback"]),
  },
  {
    id: "template-management",
    path: "documentation/workflow-studio/workflow-template-management.md",
    title: "Workflow Studio Template Management",
    requiredTerms: Object.freeze(["bibliotheek", "curated", "deprecated", "upgrade"]),
  },
  {
    id: "change-manager-training",
    path: "documentation/workflow-studio/workflow-change-manager-training.md",
    title: "Workflow Studio Change Manager Training",
    requiredTerms: Object.freeze(["oefening", "publiceren", "starten", "goedkeuren"]),
  },
]);

export function auditWorkflowStudioOperatingDocs(
  documents: Readonly<Record<string, string | undefined>>,
): WorkflowStudioOperatingDocsAudit {
  const missing: string[] = [];
  for (const document of WORKFLOW_STUDIO_OPERATING_DOCUMENTS) {
    const content = documents[document.path] ?? "";
    if (!content.includes(`# ${document.title}`)) {
      missing.push(`${document.id}:title`);
      continue;
    }
    for (const term of document.requiredTerms) {
      if (!content.toLowerCase().includes(term.toLowerCase())) {
        missing.push(`${document.id}:${term}`);
      }
    }
  }
  return Object.freeze({
    ok: missing.length === 0,
    checked: Object.freeze(WORKFLOW_STUDIO_OPERATING_DOCUMENTS.map((document) => document.id)),
    missing: Object.freeze(missing),
  });
}
