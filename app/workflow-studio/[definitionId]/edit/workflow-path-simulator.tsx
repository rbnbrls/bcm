"use client";

import { useMemo, useState } from "react";
import type { WorkflowEditorEdge, WorkflowEditorNode } from "@/lib/workflow-studio/editor-model";
import {
  collectWorkflowSimulationControls,
  simulateWorkflowPath,
  type WorkflowSimulationResult,
  type WorkflowSimulationTaskOutcome,
} from "@/lib/workflow-studio/workflow-simulator";

function parseFixtureValue(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try { return JSON.parse(trimmed); } catch { return value; }
}

function serialized(value: unknown): string {
  return value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
}

export function WorkflowPathSimulator({ nodes, edges }: {
  nodes: readonly WorkflowEditorNode[];
  edges: readonly WorkflowEditorEdge[];
}) {
  const controls = useMemo(() => collectWorkflowSimulationControls(nodes), [nodes]);
  const draftSignature = useMemo(() => JSON.stringify({
    nodes: nodes.map((node) => [node.id, node.blockType, node.contractVersion, node.configuration]),
    edges,
  }), [edges, nodes]);
  const [variables, setVariables] = useState<Record<string, unknown>>(() => Object.fromEntries(
    controls.formFields.filter(({ field }) => field.defaultValue !== undefined).map(({ field }) => [field.id, field.defaultValue]),
  ));
  const [taskOutcomes, setTaskOutcomes] = useState<Record<string, WorkflowSimulationTaskOutcome>>({});
  const [lookupFixtureText, setLookupFixtureText] = useState<Record<string, string>>({});
  const [simulation, setSimulation] = useState<{ signature: string; result: WorkflowSimulationResult } | null>(null);
  const result = simulation?.signature === draftSignature ? simulation.result : null;
  const [fixtureError, setFixtureError] = useState("");

  function setVariable(id: string, value: unknown) {
    setVariables((current) => ({ ...current, [id]: value }));
  }

  function setTaskOutput(nodeKey: string, variable: string, value: unknown) {
    setTaskOutcomes((current) => ({
      ...current,
      [nodeKey]: { ...current[nodeKey], outputs: { ...current[nodeKey]?.outputs, [variable]: value } },
    }));
  }

  function runSimulation() {
    const lookupFixtures: Record<string, unknown> = {};
    try {
      for (const lookup of controls.lookups) {
        const text = lookupFixtureText[lookup.nodeKey] ?? (lookup.selection === "many" ? "[]" : "{}");
        lookupFixtures[lookup.nodeKey] = JSON.parse(text);
      }
    } catch {
      setFixtureError("Een lookupfixture bevat ongeldige JSON.");
      return;
    }
    setFixtureError("");
    setSimulation({ signature: draftSignature, result: simulateWorkflowPath(nodes, edges, { variables, taskOutcomes, lookupFixtures }) });
  }

  return <details className="workflow-path-simulator">
    <summary>Pathsimulator</summary>
    <div className="workflow-simulator-body">
      <header>
        <div><p className="eyebrow">LOKALE SANDBOX</p><h2>Test een workflowpad</h2></div>
        <p>Gebruikt uitsluitend lokale fixtures. Er worden geen productiedata gelezen, mutaties uitgevoerd of notificaties verzonden.</p>
      </header>

      <div className="workflow-simulator-grid">
        <section aria-labelledby="simulator-input-title">
          <h3 id="simulator-input-title">Inputs en fixtures</h3>
          {controls.formFields.length > 0 && <fieldset><legend>Formulierinput</legend>{controls.formFields.map(({ nodeKey, field }) => {
            const value = variables[field.id] ?? field.defaultValue;
            const label = `${field.label} · ${nodeKey}`;
            if (field.type === "boolean") return <label key={`${nodeKey}:${field.id}`}><input type="checkbox" checked={value === true} onChange={(event) => setVariable(field.id, event.target.checked)} /> {label}</label>;
            if (field.type === "select" || field.type === "multiselect") return <label key={`${nodeKey}:${field.id}`}>{label}<select multiple={field.type === "multiselect"} value={field.type === "multiselect" ? Array.isArray(value) ? value as string[] : [] : typeof value === "string" ? value : ""} onChange={(event) => setVariable(field.id, field.type === "multiselect" ? [...event.target.selectedOptions].map((option) => option.value) : event.target.value)}><option value="">Kies…</option>{field.options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>;
            return <label key={`${nodeKey}:${field.id}`}>{label}<input type={field.type === "date" ? "date" : field.type === "number" || field.type === "currency" ? "number" : "text"} value={serialized(value)} onChange={(event) => setVariable(field.id, field.type === "number" || field.type === "currency" ? Number(event.target.value) : event.target.value)} /></label>;
          })}</fieldset>}

          {controls.additionalVariables.length > 0 && <fieldset><legend>Aanvullende variabelen</legend>{controls.additionalVariables.map((variable) => <label key={variable}>{variable}<input value={serialized(variables[variable])} placeholder="tekst, getal of JSON" onChange={(event) => setVariable(variable, parseFixtureValue(event.target.value))} /></label>)}</fieldset>}

          {controls.tasks.map((task) => <fieldset key={task.nodeKey}><legend>Taakuitvoer · {task.title}</legend>{task.outputVariables.length === 0 ? <p>Deze taak schrijft geen variabelen.</p> : task.outputVariables.map((variable) => <label key={variable}>{variable}<input value={serialized(taskOutcomes[task.nodeKey]?.outputs?.[variable])} placeholder="tekst, getal of JSON" onChange={(event) => setTaskOutput(task.nodeKey, variable, parseFixtureValue(event.target.value))} /></label>)}</fieldset>)}

          {controls.approvals.map((approval) => <label key={approval.nodeKey}>Taakuitkomst · {approval.title}<select value={taskOutcomes[approval.nodeKey]?.outcome ?? "approved"} onChange={(event) => setTaskOutcomes((current) => ({ ...current, [approval.nodeKey]: { ...current[approval.nodeKey], outcome: event.target.value as "approved" | "rejected" | "returned" } }))}>{Object.entries(approval.labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>)}

          {controls.lookups.map((lookup) => <label key={lookup.nodeKey}>Gemaskeerde snapshot · {lookup.nodeKey}<textarea value={lookupFixtureText[lookup.nodeKey] ?? (lookup.selection === "many" ? "[]" : "{}") } onChange={(event) => setLookupFixtureText((current) => ({ ...current, [lookup.nodeKey]: event.target.value }))} aria-describedby={`lookup-fixture-${lookup.nodeKey}`} /><small id={`lookup-fixture-${lookup.nodeKey}`}>JSON-fixture voor <code>{lookup.outputVariable}</code>; er vindt geen catalogusquery plaats.</small></label>)}

          <button type="button" className="button button-primary" onClick={runSimulation}>Simulatie uitvoeren</button>
          {fixtureError && <p className="form-error" role="alert">{fixtureError}</p>}
        </section>

        <section aria-labelledby="simulator-result-title">
          <h3 id="simulator-result-title">Simulatieresultaat</h3>
          {!result ? <p>Kies fixtures en voer de simulatie uit.</p> : <div className="workflow-simulator-result" data-status={result.status}>
            <p className="workflow-simulator-status"><strong>{result.status === "completed" ? "Pad voltooid" : result.status === "invalid" ? "Simulatie ongeldig" : "Pad gestopt"}</strong></p>
            {result.issues.length > 0 && <ul className="workflow-simulator-issues">{result.issues.map((issue, index) => <li key={`${issue}:${index}`}>{issue}</li>)}</ul>}
            <section><h4>Bezocht pad</h4><ol className="workflow-simulator-path">{result.visitedNodeKeys.map((nodeKey) => <li key={nodeKey}><code>{nodeKey}</code></li>)}</ol></section>
            <section><h4>Variabelen</h4><pre>{JSON.stringify(result.variables, null, 2)}</pre></section>
            <section><h4>Beslisredenen</h4>{result.decisions.length === 0 ? <p>Geen beslissingen bezocht.</p> : <ul>{result.decisions.map((decision) => <li key={decision.nodeKey}><strong>{decision.nodeKey} → {decision.outputPort}</strong><span>{decision.explanation}</span></li>)}</ul>}</section>
            <section><h4>Verwachte intents</h4>{result.intents.length === 0 ? <p>Geen intents gepland.</p> : <pre>{JSON.stringify(result.intents, null, 2)}</pre>}</section>
            <section><h4>Verwachte audit-events</h4><ol className="workflow-simulator-audit">{result.auditEvents.map((event) => <li key={event.sequence}><code>{event.sequence}. {event.type}</code><span>{event.detail}</span></li>)}</ol></section>
          </div>}
        </section>
      </div>
    </div>
  </details>;
}
