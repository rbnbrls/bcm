"use client";

import type { WorkflowEditorEdge, WorkflowEditorNode } from "@/lib/workflow-studio/editor-model";
import type { WorkflowEditorValidationSummary } from "@/lib/workflow-studio/editor-validation";
import { WORKFLOW_GLOSSARY, businessLabel } from "@/lib/workflow-studio/business-language";

const STEP_LABELS = ["Doel", "Gegevens", "Goedkeuring", "Actie", "Testen", "Publiceren"] as const;

function orderedNodes(nodes: readonly WorkflowEditorNode[], edges: readonly WorkflowEditorEdge[]): readonly WorkflowEditorNode[] {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) outgoing.set(edge.sourceNodeId, [...(outgoing.get(edge.sourceNodeId) ?? []), edge.targetNodeId]);
  const result: WorkflowEditorNode[] = [];
  const seen = new Set<string>();
  function visit(id: string) {
    if (seen.has(id)) return;
    seen.add(id);
    const node = nodes.find((item) => item.id === id);
    if (!node) return;
    result.push(node);
    for (const next of outgoing.get(id) ?? []) visit(next);
  }
  for (const node of nodes.filter((item) => item.blockType === "manual_start")) visit(node.id);
  for (const node of nodes) visit(node.id);
  return result;
}

function cardLabel(node: WorkflowEditorNode): string {
  const labels: Record<string, string> = {
    manual_start: "Start",
    form: "Gegevens invullen",
    role_task: "Beoordeling",
    approval: "Goedkeuring",
    change_request: "Actie uitvoeren",
    notification: "Melding",
    end: "Einde",
  };
  return labels[node.blockType] ?? node.label;
}

export function WorkflowGuidedEditor({
  nodes,
  edges,
  validation,
  onAdvancedMode,
  onOpenSection,
}: {
  nodes: readonly WorkflowEditorNode[];
  edges: readonly WorkflowEditorEdge[];
  validation: WorkflowEditorValidationSummary;
  onAdvancedMode: () => void;
  onOpenSection: (id: string) => void;
}) {
  const processSteps = orderedNodes(nodes, edges);
  const firstError = validation.blockers[0] ?? validation.warnings[0];
  return (
    <section className="workflow-guided-editor" aria-labelledby="workflow-guided-title">
      <div className="workflow-guided-heading">
        <div><p className="eyebrow">BEGELEIDE MODUS</p><h2 id="workflow-guided-title">Bouw je proces stap voor stap</h2><p>Je hoeft geen technische workflowkennis te hebben. We bewaren de technische details op de achtergrond.</p></div>
        <button type="button" className="button button-secondary" onClick={onAdvancedMode}>Geavanceerde modus</button>
      </div>
      <ol className="workflow-guided-steps" aria-label="Voortgang workflow">
        {STEP_LABELS.map((label, index) => <li className={index === 0 ? "is-current" : undefined} key={label}><span>{index + 1}</span>{label}</li>)}
      </ol>

      <section className="workflow-process-card" aria-labelledby="process-map-title">
        <div className="workflow-panel-heading"><div><h3 id="process-map-title">Proceskaart</h3><p>Deze stappen worden automatisch verbonden.</p></div><span>{processSteps.length} stappen</span></div>
        <div className="workflow-process-map" role="list" aria-label="Workflowproces">
          {processSteps.map((node, index) => <div className="workflow-process-step" role="listitem" key={node.id}><div className="workflow-process-step-card"><span>{index + 1}</span><strong>{cardLabel(node)}</strong><small>{node.label}</small></div>{index < processSteps.length - 1 ? <span className="workflow-process-arrow" aria-hidden="true">→</span> : null}</div>)}
        </div>
      </section>

      <div className="workflow-guided-actions">
        <button type="button" className="workflow-guided-action" onClick={() => onOpenSection("workflow-metadata-title")}><strong>1. Doel en gegevens</strong><span>Naam, beschrijving en formulieren</span></button>
        <button type="button" className="workflow-guided-action" onClick={() => onOpenSection("workflow-review-title")}><strong>2. Goedkeuring en publiceren</strong><span>Rollen, review en publicatie</span></button>
        <button type="button" className="workflow-guided-action" onClick={() => onOpenSection("workflow-simulator-title")}><strong>3. Test dit pad</strong><span>Gebruik veilige voorbeeldgegevens</span></button>
      </div>

      <div className="workflow-guided-status" data-status={firstError ? "attention" : "ready"} role="status">
        <strong>{firstError ? "Er is nog aandacht nodig" : "De processtructuur is geldig"}</strong>
        <span>{firstError ? "Bekijk de concrete herstelactie bij de betreffende processtap." : "Je kunt de workflow testen of ter review aanbieden."}</span>
      </div>

      <details className="workflow-glossary"><summary>Woordenlijst en uitleg</summary><dl>{WORKFLOW_GLOSSARY.map((item) => <div key={item.term}><dt>{item.term}</dt><dd>{item.explanation}</dd></div>)}</dl><p className="sr-only">Interne termen zoals node, edge en {businessLabel("blockType")} zijn verborgen in deze modus.</p></details>
    </section>
  );
}
