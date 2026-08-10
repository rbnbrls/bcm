"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BlockCatalogEntry } from "@/lib/workflow-studio/block-registry";
import type { PublicChangeRequestCatalogResource, PublicDataCatalogResource } from "@/lib/workflow-studio/data-catalog";
import type { WorkflowRoleBindingInput } from "@/lib/workflow-studio/definition-schema";
import { WorkflowMetadataPanel, type WorkflowEditorMetadata } from "./workflow-metadata-panel";
import { WorkflowFormBuilder } from "./workflow-form-builder";
import { WorkflowHumanTaskBuilder } from "./workflow-human-task-builder";
import { WorkflowLookupBuilder } from "./workflow-lookup-builder";
import { WorkflowChangeRequestBuilder } from "./workflow-change-request-builder";
import { WorkflowDecisionBuilder } from "./workflow-decision-builder";
import { WorkflowNotificationBuilder } from "./workflow-notification-builder";
import { WorkflowContractProperties } from "./workflow-contract-properties";
import { WorkflowLivePreview } from "./workflow-live-preview";
import { WorkflowPathSimulator } from "./workflow-path-simulator";
import { WorkflowAutosaveStatus, useWorkflowAutosave, type WorkflowAutosaveAction } from "./workflow-autosave";
import { WorkflowValidationPanel } from "./workflow-validation-panel";
import { WorkflowReviewPanel } from "./workflow-review-panel";
import type { WorkflowReviewDiff } from "@/lib/workflow-studio/workflow-review";
import { collectWorkflowVariableOptions } from "@/lib/workflow-studio/properties-schema";
import type { WorkflowPreviewMetadata } from "@/lib/workflow-studio/workflow-preview";
import {
  applyWorkflowEditorQuickFix,
  validateWorkflowEditorDraft,
  type WorkflowEditorPanelIssue,
  type WorkflowEditorQuickFix,
} from "@/lib/workflow-studio/editor-validation";
import {
  autoLayoutWorkflowEditorGraph,
  canConnectWorkflowEditorPorts,
  commitWorkflowEditorGraph,
  connectWorkflowEditorPorts,
  createWorkflowEditorHistory,
  createWorkflowEditorNode,
  moveWorkflowEditorNode,
  redoWorkflowEditorGraph,
  removeWorkflowEditorEdge,
  removeWorkflowEditorNode,
  updateWorkflowEditorNodeConfiguration,
  undoWorkflowEditorGraph,
  type WorkflowEditorEdge,
  type WorkflowEditorNode,
  type WorkflowEditorPosition,
  type WorkflowEditorPortReference,
} from "@/lib/workflow-studio/editor-model";

const BLOCK_DRAG_TYPE = "application/x-bcm-workflow-block";
const NODE_DRAG_TYPE = "application/x-bcm-workflow-node";
const KEYBOARD_STEP = 16;
const EMPTY_ROLE_BINDINGS: readonly WorkflowRoleBindingInput[] = Object.freeze([]);
const EMPTY_REVIEW_DIFF: WorkflowReviewDiff = Object.freeze({
  baselineVersionNumber: null,
  changes: Object.freeze([]),
  counts: Object.freeze({ added: 0, removed: 0, changed: 0 }),
});

function createClientId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function configurationEntries(configuration: unknown): [string, string][] {
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) return [];
  return Object.entries(configuration).map(([key, value]) => [
    key,
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : JSON.stringify(value),
  ]);
}

export function WorkflowEditorShell({
  workflowName,
  revision,
  catalog,
  initialNodes,
  initialEdges,
  initialMetadata,
  dataCatalog,
  changeRequestCatalog,
  roleBindings = EMPTY_ROLE_BINDINGS,
  autosaveAction,
  autosaveDelayMs,
  reviewDiff = EMPTY_REVIEW_DIFF,
  initialReviewDecision = null,
  readOnly = false,
}: {
  workflowName: string;
  revision: string;
  catalog: readonly BlockCatalogEntry[];
  initialNodes: readonly WorkflowEditorNode[];
  initialEdges: readonly WorkflowEditorEdge[];
  initialMetadata: WorkflowEditorMetadata;
  dataCatalog: readonly PublicDataCatalogResource[];
  changeRequestCatalog: readonly PublicChangeRequestCatalogResource[];
  roleBindings?: readonly WorkflowRoleBindingInput[];
  autosaveAction?: WorkflowAutosaveAction;
  autosaveDelayMs?: number;
  reviewDiff?: WorkflowReviewDiff;
  initialReviewDecision?: "submitted" | "approved" | "rejected" | null;
  readOnly?: boolean;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const [history, setHistory] = useState(() => createWorkflowEditorHistory({ nodes: initialNodes, edges: initialEdges }));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialNodes[0]?.id ?? null);
  const [pendingSource, setPendingSource] = useState<WorkflowEditorPortReference | null>(null);
  const [zoom, setZoom] = useState(1);
  const [announcement, setAnnouncement] = useState("Editor geladen.");
  const [focusedProperty, setFocusedProperty] = useState<string | null>(null);
  const [currentRevision, setCurrentRevision] = useState(revision);
  const [previewMetadata, setPreviewMetadata] = useState<WorkflowPreviewMetadata>({
    name: initialMetadata.name,
    description: initialMetadata.description,
    catalogDescription: initialMetadata.catalogDescription,
    costModel: initialMetadata.costModel,
  });
  const { nodes, edges } = history.present;
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const validation = useMemo(() => validateWorkflowEditorDraft(nodes, edges, catalog), [catalog, edges, nodes]);
  const warningSignature = validation.warnings.map((warning) => `${warning.code}:${warning.id}`).sort().join("|");
  const [acknowledgedWarningSignature, setAcknowledgedWarningSignature] = useState(validation.warnings.length === 0 ? warningSignature : null);
  const warningsAcknowledged = validation.warnings.length === 0 || acknowledgedWarningSignature === warningSignature;
  const variableOptions = useMemo(() => collectWorkflowVariableOptions(nodes, selectedNodeId ?? undefined), [nodes, selectedNodeId]);
  const restoreGraph = useCallback((graph: { nodes: readonly WorkflowEditorNode[]; edges: readonly WorkflowEditorEdge[] }) => {
    setHistory(createWorkflowEditorHistory(graph));
    setSelectedNodeId(graph.nodes[0]?.id ?? null);
    setFocusedProperty(null);
    setAnnouncement("Lokale herstelkopie geladen.");
  }, []);
  const autosave = useWorkflowAutosave({
    definitionId: initialMetadata.definitionId,
    revision: currentRevision,
    graph: history.present,
    roleBindings,
    valid: validation.blockers.length === 0,
    onRevisionChange: setCurrentRevision,
    onRestore: restoreGraph,
    ...(autosaveAction ? { action: autosaveAction } : {}),
    ...(autosaveDelayMs !== undefined ? { delayMs: autosaveDelayMs } : {}),
  });

  useEffect(() => {
    if (!focusedProperty) return;
    const target = [...(inspectorRef.current?.querySelectorAll<HTMLElement>("[data-property-name]") ?? [])]
      .find((element) => element.dataset.propertyName === focusedProperty);
    const control = target?.querySelector<HTMLElement>("input, textarea, select, button");
    (control ?? inspectorRef.current)?.focus();
    target?.scrollIntoView?.({ block: "nearest" });
  }, [focusedProperty, selectedNodeId]);

  function selectNode(nodeId: string | null) {
    setSelectedNodeId(nodeId);
    setFocusedProperty(null);
  }

  function commit(graph: { nodes: readonly WorkflowEditorNode[]; edges: readonly WorkflowEditorEdge[] }, message: string) {
    setHistory((current) => commitWorkflowEditorGraph(current, graph));
    setAnnouncement(message);
  }

  function addBlock(entry: BlockCatalogEntry, position?: WorkflowEditorPosition) {
    if (readOnly) return;
    const node = createWorkflowEditorNode(entry, nodes, createClientId(), position);
    commit({ nodes: [...nodes, node], edges }, `${node.label} toegevoegd en geselecteerd.`);
    selectNode(node.id);
  }

  function removeNode(nodeId: string) {
    if (readOnly) return;
    const removed = nodes.find((node) => node.id === nodeId);
    if (!removed) return;
    const remaining = removeWorkflowEditorNode(nodes, nodeId);
    const remainingEdges = edges.filter((edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId);
    commit({ nodes: remaining, edges: remainingEdges }, `${removed.label} verwijderd.`);
    selectNode(remaining[0]?.id ?? null);
    setPendingSource(null);
  }

  function updateSelectedConfiguration(
    patch: Readonly<Record<string, unknown>>,
    message: string,
  ) {
    if (!selectedNode) return;
    const current = selectedNode.configuration && typeof selectedNode.configuration === "object" && !Array.isArray(selectedNode.configuration)
      ? selectedNode.configuration as Record<string, unknown>
      : {};
    const controlDefaults = selectedNode.blockType === "manual_start"
      ? { starterRoleIds: ["aanvrager"], dataScope: "workflow_default" }
      : selectedNode.blockType === "end"
        ? { outcome: "completed" }
        : {};
    commit({
      nodes: updateWorkflowEditorNodeConfiguration(nodes, selectedNode.id, {
        ...controlDefaults,
        ...current,
        ...patch,
      }),
      edges,
    }, message);
  }

  function moveNode(nodeId: string, position: WorkflowEditorPosition) {
    if (readOnly) return;
    const node = nodes.find((candidate) => candidate.id === nodeId);
    commit(
      { nodes: moveWorkflowEditorNode(nodes, nodeId, position), edges },
      `${node?.label ?? "Blok"} verplaatst naar x ${Math.max(0, position.x)}, y ${Math.max(0, position.y)}.`,
    );
  }

  function removeEdge(edgeId: string) {
    if (readOnly) return;
    const edge = edges.find((candidate) => candidate.id === edgeId);
    if (!edge) return;
    commit(removeWorkflowEditorEdge(history.present, edgeId), `Verbinding ${edge.edgeKey} verwijderd.`);
  }

  function connectTo(target: WorkflowEditorPortReference) {
    if (!pendingSource || readOnly) return;
    const decision = canConnectWorkflowEditorPorts(catalog, history.present, pendingSource, target);
    if (!decision.compatible) {
      setAnnouncement(`Verbinding niet mogelijk: ${decision.reason}`);
      return;
    }
    const next = connectWorkflowEditorPorts(catalog, history.present, pendingSource, target);
    if (next) commit(next, "Verbinding toegevoegd.");
    setPendingSource(null);
  }

  function undo() {
    if (history.past.length === 0) return;
    setHistory((current) => undoWorkflowEditorGraph(current));
    setPendingSource(null);
    setAnnouncement("Laatste graphwijziging ongedaan gemaakt.");
  }

  function redo() {
    if (history.future.length === 0) return;
    setHistory((current) => redoWorkflowEditorGraph(current));
    setPendingSource(null);
    setAnnouncement("Graphwijziging opnieuw uitgevoerd.");
  }

  function autoLayout() {
    commit(autoLayoutWorkflowEditorGraph(history.present), "Automatische layout toegepast.");
  }

  function navigateToIssue(issue: WorkflowEditorPanelIssue) {
    if (issue.nodeId) setSelectedNodeId(issue.nodeId);
    setFocusedProperty(issue.property ?? null);
    setAnnouncement(issue.property
      ? `Genavigeerd naar ${issue.message} Eigenschap ${issue.property}.`
      : `Genavigeerd naar ${issue.message}`);
  }

  function applyQuickFix(fix: WorkflowEditorQuickFix) {
    const next = applyWorkflowEditorQuickFix(history.present, fix, catalog, createClientId);
    if (next === history.present) {
      setAnnouncement("Deze quick fix kon niet veilig worden toegepast.");
      return;
    }
    commit(next, fix.kind === "add_end_nodes" ? "Ontbrekende eindblokken toegevoegd." : "Ontbrekende datamapping ingevuld.");
    if (fix.kind === "assign_variable") {
      setSelectedNodeId(fix.nodeId);
      setFocusedProperty(fix.property);
    }
  }

  function fitToScreen() {
    const maxX = Math.max(1, ...nodes.map((node) => node.position.x + 190));
    const maxY = Math.max(1, ...nodes.map((node) => node.position.y + 90));
    const width = canvasRef.current?.clientWidth || 800;
    const height = canvasRef.current?.clientHeight || 600;
    const nextZoom = Math.min(1.5, Math.max(.5, Math.min((width - 32) / maxX, (height - 32) / maxY)));
    setZoom(Number(nextZoom.toFixed(2)));
    setAnnouncement("Workflow passend in beeld gezet.");
  }

  function changeZoom(delta: number) {
    setZoom((current) => Math.min(1.5, Math.max(.5, Number((current + delta).toFixed(2)))));
  }

  function canvasPosition(event: React.DragEvent): WorkflowEditorPosition {
    const bounds = canvasRef.current?.getBoundingClientRect();
    const clientX = Number.isFinite(event.clientX) ? event.clientX : (bounds?.left ?? 0) + 70;
    const clientY = Number.isFinite(event.clientY) ? event.clientY : (bounds?.top ?? 0) + 24;
    return {
      x: Math.max(0, Math.round((clientX - (bounds?.left ?? 0) - 70) / zoom)),
      y: Math.max(0, Math.round((clientY - (bounds?.top ?? 0) - 24) / zoom)),
    };
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    const position = canvasPosition(event);
    const nodeId = event.dataTransfer.getData(NODE_DRAG_TYPE);
    if (nodeId) {
      moveNode(nodeId, position);
      selectNode(nodeId);
      return;
    }
    const blockType = event.dataTransfer.getData(BLOCK_DRAG_TYPE);
    const entry = catalog.find((candidate) => candidate.blockType === blockType);
    if (entry) addBlock(entry, position);
  }

  function handleNodeKeyDown(event: React.KeyboardEvent, node: WorkflowEditorNode) {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeNode(node.id);
      return;
    }
    const distance = event.shiftKey ? KEYBOARD_STEP * 3 : KEYBOARD_STEP;
    const deltas: Record<string, WorkflowEditorPosition> = {
      ArrowLeft: { x: -distance, y: 0 },
      ArrowRight: { x: distance, y: 0 },
      ArrowUp: { x: 0, y: -distance },
      ArrowDown: { x: 0, y: distance },
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    moveNode(node.id, { x: node.position.x + delta.x, y: node.position.y + delta.y });
  }

  function handleEditorKeyDown(event: React.KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  }

  function nodeEntry(node: WorkflowEditorNode) {
    return catalog.find((entry) => entry.blockType === node.blockType && entry.contractVersion === node.contractVersion);
  }

  function specializedProperties(node: WorkflowEditorNode) {
    // Hand-written editors are explicit v1 widget adapters. A newer contract
    // version automatically falls back to the JSON/UI-schema renderer.
    if (node.contractVersion !== 1) return undefined;
    switch (node.blockType) {
      case "form": return <WorkflowFormBuilder configuration={node.configuration} onChange={updateSelectedConfiguration} />;
      case "role_task":
      case "approval": return <WorkflowHumanTaskBuilder blockType={node.blockType} configuration={node.configuration} variableOptions={variableOptions} onChange={updateSelectedConfiguration} />;
      case "client_config_lookup": return <WorkflowLookupBuilder configuration={node.configuration} catalog={dataCatalog} variableOptions={variableOptions} onChange={updateSelectedConfiguration} />;
      case "change_request": return <WorkflowChangeRequestBuilder configuration={node.configuration} catalog={changeRequestCatalog} variableOptions={variableOptions} onChange={updateSelectedConfiguration} />;
      case "decision": return <WorkflowDecisionBuilder configuration={node.configuration} variableOptions={variableOptions} onChange={updateSelectedConfiguration} />;
      case "notification": return <WorkflowNotificationBuilder configuration={node.configuration} variableOptions={variableOptions} onChange={updateSelectedConfiguration} />;
      default: return undefined;
    }
  }

  function edgeLabel(edge: WorkflowEditorEdge): string {
    const source = nodes.find((node) => node.id === edge.sourceNodeId);
    const target = nodes.find((node) => node.id === edge.targetNodeId);
    return `${source?.label ?? edge.sourceNodeId}:${edge.sourcePort} → ${target?.label ?? edge.targetNodeId}:${edge.targetPort}`;
  }

  return (
    <div className="workflow-editor-shell" onKeyDown={handleEditorKeyDown}>
      <header className="workflow-editor-toolbar">
        <div>
          <p className="eyebrow">WORKFLOW STUDIO · EDITOR</p>
          <h1>{workflowName}</h1>
        </div>
        <div className="workflow-editor-state" aria-label="Editorstatus">
          <span>Revisie {currentRevision}</span>
          <strong>{autosave.dirty ? "Lokale wijzigingen" : "Draft opgeslagen"}</strong>
        </div>
      </header>

      <WorkflowAutosaveStatus autosave={autosave} />

      <p className="workflow-editor-help" id="workflow-editor-help">
        Voeg blokken toe met de paletknoppen of sleep ze naar het canvas. Gebruik poortknoppen om blokken te verbinden. Pijltoetsen verplaatsen een blok; Shift versnelt. Delete verwijdert. Ctrl/Cmd+Z maakt ongedaan.
      </p>

      <WorkflowMetadataPanel
        initial={initialMetadata}
        revision={currentRevision}
        onRevisionChange={setCurrentRevision}
        onPreviewChange={setPreviewMetadata}
        readOnly={readOnly}
      />

      <WorkflowLivePreview
        metadata={previewMetadata}
        nodes={nodes}
        edges={edges}
        roleBindings={roleBindings}
        changeRequestCatalog={changeRequestCatalog}
        blockCatalog={catalog}
      />

      <WorkflowPathSimulator nodes={nodes} edges={edges} />

      <WorkflowReviewPanel
        key={currentRevision}
        definitionId={initialMetadata.definitionId}
        revision={currentRevision}
        diff={reviewDiff}
        dirty={autosave.dirty}
        blockers={validation.blockers.length}
        warningCodes={[...new Set(validation.warnings.map((warning) => warning.code))]}
        warningsAcknowledged={warningsAcknowledged}
        initialDecision={currentRevision === revision ? initialReviewDecision : null}
        readOnly={readOnly}
      />

      <div className="workflow-editor-layout">
        <aside className="workflow-editor-palette" aria-labelledby="block-palette-title">
          <h2 id="block-palette-title">Blokkenpalet</h2>
          <div className="workflow-palette-list">
            {catalog.map((entry) => (
              <button
                type="button"
                key={`${entry.blockType}:${entry.contractVersion}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData(BLOCK_DRAG_TYPE, entry.blockType);
                }}
                onClick={() => addBlock(entry)}
              >
                <b>{entry.ui.label}</b>
                <span>{entry.ui.description}</span>
              </button>
            ))}
          </div>

          <nav className="workflow-editor-outline" aria-labelledby="workflow-outline-title">
            <h2 id="workflow-outline-title">Outline</h2>
            <ul role="tree" aria-label="Workflowstructuur">
              {nodes.map((node) => (
                <li role="treeitem" aria-selected={node.id === selectedNodeId} key={node.id}>
                  <button type="button" onClick={() => selectNode(node.id)}>
                    <span>{node.label}</span><code>{node.nodeKey}</code>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <section className="workflow-editor-canvas-panel" aria-labelledby="workflow-canvas-title">
          <div className="workflow-panel-heading">
            <h2 id="workflow-canvas-title">Canvas</h2>
            <div className="workflow-graph-toolbar" role="toolbar" aria-label="Graphbewerkingen">
              <button type="button" onClick={undo} disabled={history.past.length === 0} aria-label="Ongedaan maken">↶</button>
              <button type="button" onClick={redo} disabled={history.future.length === 0} aria-label="Opnieuw uitvoeren">↷</button>
              <button type="button" onClick={() => changeZoom(-.1)} disabled={zoom <= .5} aria-label="Uitzoomen">−</button>
              <output aria-label="Zoomniveau">{Math.round(zoom * 100)}%</output>
              <button type="button" onClick={() => changeZoom(.1)} disabled={zoom >= 1.5} aria-label="Inzoomen">+</button>
              <button type="button" onClick={fitToScreen}>Passend</button>
              <button type="button" onClick={autoLayout}>Auto-layout</button>
            </div>
          </div>
          <div
            className="workflow-editor-canvas"
            ref={canvasRef}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
            onDrop={handleDrop}
            aria-describedby="workflow-editor-help"
          >
            <div className="workflow-editor-viewport" style={{ transform: `scale(${zoom})` }}>
              <svg className="workflow-edge-layer" viewBox="0 0 1800 1100" aria-label={`${edges.length} verbindingen`}>
                <defs>
                  <marker id="workflow-edge-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 z" />
                  </marker>
                </defs>
                {edges.map((edge) => {
                  const source = nodes.find((node) => node.id === edge.sourceNodeId);
                  const target = nodes.find((node) => node.id === edge.targetNodeId);
                  if (!source || !target) return null;
                  const sourceEntry = nodeEntry(source);
                  const sourceIndex = Math.max(0, sourceEntry?.outputs.findIndex((port) => port.id === edge.sourcePort) ?? 0);
                  const targetEntry = nodeEntry(target);
                  const targetIndex = Math.max(0, targetEntry?.inputs.findIndex((port) => port.id === edge.targetPort) ?? 0);
                  return (
                    <path
                      key={edge.id}
                      d={`M ${source.position.x + 180} ${source.position.y + 30 + sourceIndex * 16} C ${source.position.x + 220} ${source.position.y + 30 + sourceIndex * 16}, ${target.position.x - 40} ${target.position.y + 30 + targetIndex * 16}, ${target.position.x} ${target.position.y + 30 + targetIndex * 16}`}
                      markerEnd="url(#workflow-edge-arrow)"
                    />
                  );
                })}
              </svg>
              {nodes.map((node) => {
                const entry = nodeEntry(node);
                return (
                  <div
                    className="workflow-canvas-node-wrap"
                    style={{ transform: `translate(${node.position.x}px, ${node.position.y}px)` }}
                    draggable
                    key={node.id}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(NODE_DRAG_TYPE, node.id);
                    }}
                  >
                    <div className="workflow-node-ports workflow-node-ports--input" aria-label={`Ingangen van ${node.label}`}>
                      {entry?.inputs.map((port) => {
                        const decision = pendingSource
                          ? canConnectWorkflowEditorPorts(catalog, history.present, pendingSource, { nodeId: node.id, portId: port.id })
                          : null;
                        return (
                          <button
                            type="button"
                            key={port.id}
                            className={`workflow-port workflow-port--input${decision?.compatible ? " is-compatible" : decision ? " is-incompatible" : ""}`}
                            aria-label={`Ingang ${port.label} van ${node.label}`}
                            aria-disabled={decision ? !decision.compatible : undefined}
                            title={decision && !decision.compatible ? decision.reason : `${port.label} · ${port.valueType}`}
                            onClick={() => connectTo({ nodeId: node.id, portId: port.id })}
                          />
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className={`workflow-canvas-node${node.id === selectedNodeId ? " is-selected" : ""}`}
                      aria-pressed={node.id === selectedNodeId}
                      aria-label={`${node.label}, x ${node.position.x}, y ${node.position.y}`}
                      onClick={() => selectNode(node.id)}
                      onKeyDown={(event) => handleNodeKeyDown(event, node)}
                    >
                      <span>{node.label}</span>
                      <code>{node.nodeKey}</code>
                    </button>
                    <div className="workflow-node-ports workflow-node-ports--output" aria-label={`Uitgangen van ${node.label}`}>
                      {entry?.outputs.map((port) => {
                        const active = pendingSource?.nodeId === node.id && pendingSource.portId === port.id;
                        return (
                          <button
                            type="button"
                            key={port.id}
                            className={`workflow-port workflow-port--output${active ? " is-pending" : ""}`}
                            aria-label={`Uitgang ${port.label} van ${node.label}`}
                            aria-pressed={active}
                            title={`${port.label} · ${port.valueType}`}
                            onClick={() => {
                              setPendingSource(active ? null : { nodeId: node.id, portId: port.id });
                              setAnnouncement(active ? "Verbinden geannuleerd." : `Kies een compatibele ingang voor ${node.label}:${port.label}.`);
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="workflow-editor-inspector" aria-label="Workflowdetails" ref={inspectorRef} tabIndex={-1}>
          <section aria-labelledby="properties-title" data-target-property={focusedProperty ?? undefined}>
            <h2 id="properties-title">Properties</h2>
            {focusedProperty && <p className="workflow-property-target" role="status">Eigenschap: <code>{focusedProperty}</code></p>}
            {selectedNode ? (
              <>
                {(() => {
                  const entry = nodeEntry(selectedNode);
                  return entry ? <WorkflowContractProperties
                    entry={entry}
                    configuration={selectedNode.configuration}
                    variableOptions={variableOptions}
                    onChange={updateSelectedConfiguration}
                    specializedEditor={specializedProperties(selectedNode)}
                  /> : <p>Geen blockcontract beschikbaar voor deze node.</p>;
                })()}
                <dl className="workflow-properties-list">
                  <div><dt>Blok</dt><dd>{selectedNode.label}</dd></div>
                  <div><dt>Type</dt><dd><code>{selectedNode.blockType}@{selectedNode.contractVersion}</code></dd></div>
                  <div><dt>Node key</dt><dd><code>{selectedNode.nodeKey}</code></dd></div>
                  <div><dt>Positie</dt><dd>x {selectedNode.position.x}, y {selectedNode.position.y}</dd></div>
                  {configurationEntries(selectedNode.configuration).map(([key, value]) => (
                    <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
                  ))}
                </dl>
                <button className="button button-danger workflow-delete-node" type="button" onClick={() => removeNode(selectedNode.id)}>
                  Blok verwijderen
                </button>
              </>
            ) : <p>Selecteer een blok om de eigenschappen te bekijken.</p>}
          </section>

          <section className="workflow-edges-panel" aria-labelledby="connections-title">
            <div className="workflow-panel-heading">
              <h2 id="connections-title">Verbindingen</h2>
              <span>{edges.length}</span>
            </div>
            {edges.length === 0 ? <p>Nog geen verbindingen.</p> : (
              <ul>
                {edges.map((edge) => (
                  <li key={edge.id}>
                    <span>{edgeLabel(edge)}</span>
                    <button type="button" onClick={() => removeEdge(edge.id)} aria-label={`Verwijder verbinding ${edgeLabel(edge)}`}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <WorkflowValidationPanel
            key={validation.warnings.map((warning) => `${warning.id}:${warning.message}`).sort().join("|")}
            blockers={validation.blockers}
            warnings={validation.warnings}
            onNavigate={navigateToIssue}
            onQuickFix={applyQuickFix}
            warningsAcknowledged={warningsAcknowledged}
            onWarningsAcknowledgedChange={(acknowledged) => setAcknowledgedWarningSignature(acknowledged ? warningSignature : null)}
          />
        </aside>
      </div>
      <div className="sr-only" aria-live="polite">{announcement}</div>
    </div>
  );
}
