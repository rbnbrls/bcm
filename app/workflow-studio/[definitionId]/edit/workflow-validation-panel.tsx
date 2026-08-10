"use client";

import { useState } from "react";
import type { WorkflowEditorPanelIssue, WorkflowEditorQuickFix } from "@/lib/workflow-studio/editor-validation";

function IssueList({
  issues,
  onNavigate,
  onQuickFix,
}: {
  issues: readonly WorkflowEditorPanelIssue[];
  onNavigate: (issue: WorkflowEditorPanelIssue) => void;
  onQuickFix: (fix: WorkflowEditorQuickFix) => void;
}) {
  if (issues.length === 0) return <p>Geen meldingen.</p>;
  return <ul>{issues.map((issue) => <li key={issue.id} data-severity={issue.severity}>
    <button type="button" className="workflow-validation-message" onClick={() => onNavigate(issue)}>{issue.message}</button>
    {issue.fix && <small>{issue.fix}</small>}
    {issue.quickFix && <button type="button" className="workflow-validation-fix" onClick={() => onQuickFix(issue.quickFix!)}>Quick fix toepassen</button>}
  </li>)}</ul>;
}

export function WorkflowValidationPanel({
  blockers,
  warnings,
  onNavigate,
  onQuickFix,
  warningsAcknowledged: controlledAcknowledgement,
  onWarningsAcknowledgedChange,
}: {
  blockers: readonly WorkflowEditorPanelIssue[];
  warnings: readonly WorkflowEditorPanelIssue[];
  onNavigate: (issue: WorkflowEditorPanelIssue) => void;
  onQuickFix: (fix: WorkflowEditorQuickFix) => void;
  warningsAcknowledged?: boolean;
  onWarningsAcknowledgedChange?: (acknowledged: boolean) => void;
}) {
  const [localAcknowledgement, setLocalAcknowledgement] = useState(warnings.length === 0);
  const warningsAcknowledged = controlledAcknowledgement ?? localAcknowledgement;
  const setWarningsAcknowledged = onWarningsAcknowledgedChange ?? setLocalAcknowledgement;
  const publishBlocked = blockers.length > 0 || !warningsAcknowledged;

  return <section className="workflow-validation-panel" aria-labelledby="validation-title">
    <div className="workflow-panel-heading">
      <h2 id="validation-title">Validatie</h2>
      <span>{blockers.length + warnings.length}</span>
    </div>

    <section aria-labelledby="validation-blockers-title">
      <div className="workflow-panel-heading"><h3 id="validation-blockers-title">Blockers</h3><span>{blockers.length}</span></div>
      <IssueList issues={blockers} onNavigate={onNavigate} onQuickFix={onQuickFix} />
    </section>

    <section aria-labelledby="validation-warnings-title">
      <div className="workflow-panel-heading"><h3 id="validation-warnings-title">Waarschuwingen</h3><span>{warnings.length}</span></div>
      <IssueList issues={warnings} onNavigate={onNavigate} onQuickFix={onQuickFix} />
      {warnings.length > 0 && <label className="workflow-warning-acknowledgement">
        <input
          type="checkbox"
          checked={warningsAcknowledged}
          onChange={(event) => setWarningsAcknowledged(event.target.checked)}
        />
        Ik heb alle actuele waarschuwingen beoordeeld.
      </label>}
    </section>

    <output className="workflow-publish-gate" data-blocked={publishBlocked} aria-live="polite">
      {blockers.length > 0
        ? <><strong>Publicatie geblokkeerd</strong><span>Los eerst {blockers.length} blocker(s) op.</span></>
        : !warningsAcknowledged
          ? <><strong>Bevestiging vereist</strong><span>Beoordeel de waarschuwingen vóór review of publicatie.</span></>
          : <><strong>Klaar voor review</strong><span>De editorpreflight blokkeert publicatie niet. De server valideert bij publicatie opnieuw.</span></>}
    </output>
  </section>;
}
