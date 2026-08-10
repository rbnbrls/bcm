"use client";

import { useEffect, useRef, useState } from "react";
import { autosaveWorkflowGraphAction, type AutosaveWorkflowGraphState } from "@/app/workflow-studio/actions";
import type { WorkflowRoleBindingInput } from "@/lib/workflow-studio/definition-schema";
import type { WorkflowEditorGraph } from "@/lib/workflow-studio/editor-model";
import {
  createWorkflowLocalDraftSnapshot,
  parseWorkflowLocalDraftSnapshot,
  toWorkflowAutosaveRequest,
  workflowGraphSignature,
  workflowLocalDraftStorageKey,
  type WorkflowLocalDraftSnapshot,
} from "@/lib/workflow-studio/workflow-autosave";

export type WorkflowAutosaveAction = (input: ReturnType<typeof toWorkflowAutosaveRequest>) => Promise<AutosaveWorkflowGraphState>;
type AutosavePhase = "idle" | "saving" | "saved" | "error" | "conflict";

export function useWorkflowAutosave({
  definitionId,
  revision,
  graph,
  roleBindings,
  valid,
  onRevisionChange,
  onRestore,
  action = autosaveWorkflowGraphAction,
  delayMs = 800,
}: {
  definitionId: string;
  revision: string;
  graph: WorkflowEditorGraph;
  roleBindings: readonly WorkflowRoleBindingInput[];
  valid: boolean;
  onRevisionChange: (revision: string) => void;
  onRestore: (graph: WorkflowEditorGraph) => void;
  action?: WorkflowAutosaveAction;
  delayMs?: number;
}) {
  const signature = workflowGraphSignature(graph);
  const [initialSignature] = useState(signature);
  const latestSignature = useRef(signature);
  const [savedSignature, setSavedSignature] = useState(signature);
  const [phase, setPhase] = useState<AutosavePhase>("idle");
  const [message, setMessage] = useState("Draft geladen.");
  const [recovery, setRecovery] = useState<WorkflowLocalDraftSnapshot | null>(null);
  const dirty = signature !== savedSignature;
  const storageKey = workflowLocalDraftStorageKey(definitionId);

  useEffect(() => {
    latestSignature.current = signature;
  }, [signature]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(storageKey);
        const snapshot = stored ? parseWorkflowLocalDraftSnapshot(stored, definitionId) : null;
        if (snapshot && workflowGraphSignature(snapshot.graph) !== initialSignature) setRecovery(snapshot);
        else if (stored) window.localStorage.removeItem(storageKey);
      } catch { /* Browseropslag kan door privacybeleid zijn uitgeschakeld. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [definitionId, initialSignature, storageKey]);

  useEffect(() => {
    if (!dirty || !valid) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(createWorkflowLocalDraftSnapshot(definitionId, revision, graph)));
    } catch { /* Serverautosave blijft beschikbaar wanneer localStorage faalt. */ }
  }, [definitionId, dirty, graph, revision, storageKey, valid]);

  useEffect(() => {
    if (!dirty || !valid || phase === "saving" || phase === "conflict") return;
    const sentSignature = signature;
    const sentRevision = revision;
    const timer = window.setTimeout(async () => {
      setPhase("saving");
      setMessage("Lokale wijzigingen opslaan…");
      try {
        const result = await action(toWorkflowAutosaveRequest(definitionId, sentRevision, graph, roleBindings));
        if (!result.success) {
          setPhase(result.code === "revision_conflict" ? "conflict" : "error");
          setMessage(result.message);
          return;
        }
        setSavedSignature(sentSignature);
        if (result.revision) onRevisionChange(result.revision);
        if (latestSignature.current === sentSignature) {
          try { window.localStorage.removeItem(storageKey); } catch { /* De serverkopie is al veilig. */ }
          setPhase("saved");
          setMessage("Alle graphwijzigingen zijn opgeslagen.");
        } else {
          setPhase("idle");
          setMessage("Nieuwere lokale wijzigingen wachten op autosave.");
        }
      } catch {
        setPhase("error");
        setMessage("Automatisch opslaan is tijdelijk mislukt; de lokale herstelkopie blijft bewaard.");
      }
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [action, definitionId, delayMs, dirty, graph, onRevisionChange, phase, revision, roleBindings, signature, storageKey, valid]);

  function discardRecovery() {
    try { window.localStorage.removeItem(storageKey); } catch { /* Geen verdere actie nodig. */ }
    setRecovery(null);
  }

  function restoreRecovery() {
    if (!recovery) return;
    onRestore(structuredClone(recovery.graph));
    setRecovery(null);
    setPhase("idle");
    setMessage("Lokale herstelkopie geladen; autosave controleert de serverrevisie.");
  }

  return {
    dirty,
    phase,
    message: !valid && dirty ? "Lokale wijzigingen bevatten blockers en worden nog niet naar de server geschreven." : message,
    recovery,
    retry: () => { if (phase === "error") setPhase("idle"); },
    discardRecovery,
    restoreRecovery,
    reloadServerVersion: () => window.location.reload(),
  };
}

export function WorkflowAutosaveStatus({ autosave }: {
  autosave: ReturnType<typeof useWorkflowAutosave>;
}) {
  return <>
    <div className="workflow-autosave-status" data-phase={autosave.phase} aria-live="polite">
      <strong>{autosave.phase === "conflict" ? "Edit-conflict" : autosave.dirty ? autosave.phase === "saving" ? "Autosave actief" : "Autosave wacht" : "Opgeslagen"}</strong>
      <span>{autosave.message}</span>
      {autosave.phase === "error" && <button type="button" onClick={autosave.retry}>Opnieuw proberen</button>}
      {autosave.phase === "conflict" && <button type="button" onClick={autosave.reloadServerVersion}>Serverversie laden</button>}
    </div>
    {autosave.recovery && <aside className="workflow-recovery-banner" role="alert">
      <div><strong>Lokale herstelkopie gevonden</strong><span>Opgeslagen op {new Date(autosave.recovery.savedAt).toLocaleString("nl-NL")} vanaf revisie {autosave.recovery.baseRevision}.</span></div>
      <button type="button" onClick={autosave.restoreRecovery}>Lokale draft herstellen</button>
      <button type="button" onClick={autosave.discardRecovery}>Herstelkopie verwijderen</button>
    </aside>}
  </>;
}
