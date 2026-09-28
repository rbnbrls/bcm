"use client";

import { useState, useTransition } from "react";
import type { WorkflowReviewDiff } from "@/lib/workflow-studio/workflow-review";
import {
  publishWorkflowDraftAction,
  reviewWorkflowDraftAction,
  submitWorkflowForReviewAction,
  type WorkflowReviewActionState,
} from "@/app/workflow-studio/actions";

const KIND_LABEL = { added: "Toegevoegd", removed: "Verwijderd", changed: "Gewijzigd" } as const;

export function WorkflowReviewPanel({
  definitionId,
  revision,
  diff,
  dirty,
  blockers,
  warningCodes,
  warningsAcknowledged,
  initialDecision,
  readOnly = false,
}: {
  definitionId: string;
  revision: string;
  diff: WorkflowReviewDiff;
  dirty: boolean;
  blockers: number;
  warningCodes: readonly string[];
  warningsAcknowledged: boolean;
  initialDecision: "submitted" | "approved" | "rejected" | null;
  readOnly?: boolean;
}) {
  const [notes, setNotes] = useState("");
  const [decision, setDecision] = useState(initialDecision);
  const [result, setResult] = useState<WorkflowReviewActionState | null>(null);
  const [pending, startTransition] = useTransition();
  const ready = !dirty && blockers === 0 && warningsAcknowledged;

  function run(action: () => Promise<WorkflowReviewActionState>) {
    startTransition(async () => {
      const next = await action();
      setResult(next);
      if (next.success && next.decision && next.decision !== "published") setDecision(next.decision);
    });
  }

  return <section className="workflow-review-panel" aria-labelledby="workflow-review-title">
    <div className="workflow-panel-heading">
      <div><p className="eyebrow">REVIEW & PUBLICATIE</p><h2 id="workflow-review-title">Wijzigingen in revisie {revision}</h2></div>
      <span>{diff.changes.length}</span>
    </div>
    <p>{diff.baselineVersionNumber === null ? "Eerste publicatie: de volledige workflow is nieuw." : `Vergelijking met gepubliceerde versie ${diff.baselineVersionNumber}.`}</p>
    <div className="workflow-review-counts" aria-label="Samenvatting wijzigingen">
      <span>+{diff.counts.added}</span><span>−{diff.counts.removed}</span><span>~{diff.counts.changed}</span>
    </div>
    {diff.changes.length === 0 ? <p>Geen inhoudelijke wijzigingen.</p> : <ul className="workflow-review-diff">
      {diff.changes.map((change) => <li key={`${change.area}:${change.key}:${change.kind}`}>
        <b>{KIND_LABEL[change.kind]}</b><span>{change.area} · {change.label}</span>
      </li>)}
    </ul>}
    <label>Reviewnotitie
      <textarea value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} placeholder="Motivatie of aandachtspunten" />
    </label>
    <div className="workflow-review-actions">
      <button type="button" disabled={readOnly || !ready || pending} onClick={() => run(() => submitWorkflowForReviewAction({ definitionId, expectedRevision: Number(revision), notes }))}>Ter review aanbieden</button>
      <button type="button" disabled={readOnly || !ready || pending || notes.trim().length === 0} onClick={() => run(() => reviewWorkflowDraftAction({ definitionId, expectedRevision: Number(revision), decision: "approved", notes }))}>Goedkeuren</button>
      <button type="button" className="button-secondary" disabled={readOnly || dirty || pending || notes.trim().length === 0} onClick={() => run(() => reviewWorkflowDraftAction({ definitionId, expectedRevision: Number(revision), decision: "rejected", notes }))}>Afwijzen</button>
      <button type="button" disabled={readOnly || !ready || pending || decision !== "approved"} onClick={() => run(() => publishWorkflowDraftAction({ definitionId, expectedRevision: Number(revision), acknowledgedWarningCodes: warningCodes }))}>Publiceren</button>
    </div>
    <output aria-live="polite" data-success={result?.success ?? false}>
      {pending ? "Bezig…" : result?.message ?? `Status: ${decision ? KIND_LABEL[decision === "submitted" ? "changed" : decision === "approved" ? "added" : "removed"] : "nog niet aangeboden"}.`}
      {result?.contentHash && <><br /><code>SHA-256 {result.contentHash}</code></>}
    </output>
  </section>;
}
