import type { IdentityContext } from "@/lib/identity/types";
import type { CreateWorkflowDraftInput } from "@/lib/workflow-studio/definition-schema";
import {
  buildBuiltinWorkflowTemplateDraft,
  type BuiltinWorkflowTemplateId,
} from "@/lib/workflow-studio/builtin-workflow-templates";

export type WorkflowTemplateLibraryKind = "template" | "fragment";
export type WorkflowTemplateLibrarySource =
  | Readonly<{ kind: "builtin"; id: BuiltinWorkflowTemplateId }>
  | Readonly<{ kind: "fragment"; fragmentId: string }>;

export type WorkflowTemplateLibraryRating = Readonly<{
  score: number;
  count: number;
}>;

export type WorkflowTemplateLibraryEntry = Readonly<{
  id: string;
  kind: WorkflowTemplateLibraryKind;
  version: number;
  title: string;
  description: string;
  ownerUserId: string;
  tags: readonly string[];
  sampleData: Readonly<Record<string, unknown>>;
  rating: WorkflowTemplateLibraryRating;
  source: WorkflowTemplateLibrarySource;
  status: "curated" | "deprecated";
}>;

export type WorkflowTemplateInstantiation = Readonly<{
  draft: CreateWorkflowDraftInput;
  source: Readonly<{
    libraryEntryId: string;
    libraryEntryVersion: number;
    source: WorkflowTemplateLibrarySource;
  }>;
}>;

export type WorkflowTemplateUpgradeCandidate = Readonly<{
  currentEntryId: string;
  currentVersion: number;
  nextEntryId: string;
  nextVersion: number;
  title: string;
  tags: readonly string[];
}>;

const CURATED_LIBRARY: readonly WorkflowTemplateLibraryEntry[] = Object.freeze([
  {
    id: "benchmark_switch.v1",
    kind: "template",
    version: 1,
    title: "Benchmarkwissel",
    description: "Portefeuille selecteren, IST-benchmark ophalen, SOLL-benchmark aanvragen en laten goedkeuren.",
    ownerUserId: "workflow-library",
    tags: Object.freeze(["change", "benchmark", "ist-soll"]),
    sampleData: Object.freeze({ client: "Horizon", currentBenchmark: "MSCI World", requestedBenchmark: "MSCI ACWI" }),
    rating: Object.freeze({ score: 4.8, count: 12 }),
    source: Object.freeze({ kind: "builtin", id: "benchmark_switch" }),
    status: "curated",
  },
  {
    id: "generic_field_change.v1",
    kind: "template",
    version: 1,
    title: "Generieke veldwijziging",
    description: "Herbruikbaar IST/SOLL-formulier met controle- en goedkeuringsstappen voor een configureerbaar veld.",
    ownerUserId: "workflow-library",
    tags: Object.freeze(["change", "generic", "ist-soll"]),
    sampleData: Object.freeze({ resourceReference: "portfolio:HOR*EQALT*MAN", currentValue: "OLD", requestedValue: "NEW" }),
    rating: Object.freeze({ score: 4.4, count: 8 }),
    source: Object.freeze({ kind: "builtin", id: "generic_field_change" }),
    status: "curated",
  },
  {
    id: "risk_gate_fragment.v1",
    kind: "fragment",
    version: 1,
    title: "Risico-goedkeuringsfragment",
    description: "Compact fragment met requester-scope start, risicoreview en expliciet akkoord/afwijzingseinde.",
    ownerUserId: "workflow-library",
    tags: Object.freeze(["fragment", "approval", "risk"]),
    sampleData: Object.freeze({ requestName: "Benchmark switch", riskLevel: "medium" }),
    rating: Object.freeze({ score: 4.6, count: 5 }),
    source: Object.freeze({ kind: "fragment", fragmentId: "risk_gate" }),
    status: "curated",
  },
  {
    id: "risk_gate_fragment.v2",
    kind: "fragment",
    version: 2,
    title: "Risico-goedkeuringsfragment",
    description: "Risicoreviewfragment met expliciete inputvariabele en multi-approval metadata-ready structuur.",
    ownerUserId: "workflow-library",
    tags: Object.freeze(["fragment", "approval", "risk", "multi-approval-ready"]),
    sampleData: Object.freeze({ requestName: "Benchmark switch", riskLevel: "high" }),
    rating: Object.freeze({ score: 4.9, count: 3 }),
    source: Object.freeze({ kind: "fragment", fragmentId: "risk_gate" }),
    status: "curated",
  },
]);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function originTags(entry: WorkflowTemplateLibraryEntry): readonly string[] {
  return Object.freeze([`library:${entry.id}`, `library-version:${entry.version}`]);
}

function buildRiskGateFragmentDraft(
  entry: WorkflowTemplateLibraryEntry,
  scope: { tenant: string; businessUnit: string; clientIds?: readonly string[] },
): CreateWorkflowDraftInput {
  const draftScope = {
    tenant: scope.tenant,
    businessUnit: scope.businessUnit,
    ...(scope.clientIds ? { clientIds: [...scope.clientIds] } : {}),
  };
  const inputVariables = entry.version >= 2 ? ["request_name", "risk_level"] : ["request_name"];
  return {
    scope: draftScope,
    name: entry.title,
    slug: entry.id.replaceAll(".", "_"),
    description: entry.description,
    category: "compliance",
    tags: [...entry.tags, ...originTags(entry)],
    catalogDescription: `Bibliotheekbron: ${entry.id}@${entry.version}. ${entry.description}`,
    costModel: { baseCost: 0, currency: "EUR", description: "Herbruikbaar workflowfragment." },
    nodes: [
      {
        nodeKey: "start",
        block: { blockType: "manual_start", contractVersion: 1 },
        configuration: { label: "Start fragment", dataScope: "workflow_default" },
        position: { x: 80, y: 120 },
      },
      {
        nodeKey: "risk_approval",
        block: { blockType: "approval", contractVersion: 1 },
        configuration: {
          roleId: "risk_reviewer",
          title: "Risico goedkeuren",
          instructions: "Controleer het risiconiveau en leg het besluit vast.",
          inputVariables,
        },
        position: { x: 360, y: 120 },
      },
      {
        nodeKey: "approved",
        block: { blockType: "end", contractVersion: 1 },
        configuration: { label: "Goedgekeurd", outcome: "completed" },
        position: { x: 640, y: 80 },
      },
      {
        nodeKey: "rejected",
        block: { blockType: "end", contractVersion: 1 },
        configuration: { label: "Afgewezen", outcome: "rejected" },
        position: { x: 640, y: 180 },
      },
    ],
    edges: [
      { edgeKey: "start_to_review", sourceNodeId: "start", sourcePort: "out", targetNodeId: "risk_approval", targetPort: "in" },
      { edgeKey: "review_approved", sourceNodeId: "risk_approval", sourcePort: "approved", targetNodeId: "approved", targetPort: "in" },
      { edgeKey: "review_rejected", sourceNodeId: "risk_approval", sourcePort: "rejected", targetNodeId: "rejected", targetPort: "in" },
    ],
    roleBindings: [{
      workflowRole: "risk_reviewer",
      identityGroup: "bcm:role:account_manager",
      permissions: ["workflow:approve"],
      tenant: scope.tenant,
      businessUnit: scope.businessUnit,
      ...(scope.clientIds ? { clientIds: [...scope.clientIds] } : {}),
    }],
  };
}

export function listWorkflowTemplateLibraryEntries(input: Readonly<{
  kind?: WorkflowTemplateLibraryKind;
  tags?: readonly string[];
  includeDeprecated?: boolean;
}> = {}): readonly WorkflowTemplateLibraryEntry[] {
  const tags = new Set(input.tags ?? []);
  return Object.freeze(CURATED_LIBRARY
    .filter((entry) => (input.includeDeprecated || entry.status === "curated"))
    .filter((entry) => !input.kind || entry.kind === input.kind)
    .filter((entry) => [...tags].every((tag) => entry.tags.includes(tag)))
    .map(clone)
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.title.localeCompare(right.title) || left.version - right.version));
}

export function getWorkflowTemplateLibraryEntry(entryId: string): WorkflowTemplateLibraryEntry | null {
  return clone(CURATED_LIBRARY.find((entry) => entry.id === entryId) ?? null);
}

export function instantiateWorkflowTemplateLibraryEntry(
  entryId: string,
  identity: IdentityContext,
  scope: { tenant: string; businessUnit: string; clientIds?: readonly string[] },
  overrides: Readonly<{ name?: string; slug?: string; description?: string }> = {},
): WorkflowTemplateInstantiation | null {
  const entry = getWorkflowTemplateLibraryEntry(entryId);
  if (!entry || entry.status !== "curated") return null;
  const draft = entry.source.kind === "builtin"
    ? buildBuiltinWorkflowTemplateDraft(entry.source.id, identity, scope)
    : buildRiskGateFragmentDraft(entry, scope);
  const tags = [...new Set([...(draft.tags ?? []), ...entry.tags, ...originTags(entry)])];
  return Object.freeze({
    draft: {
      ...draft,
      name: overrides.name ?? draft.name,
      slug: overrides.slug ?? draft.slug,
      description: overrides.description ?? draft.description,
      tags,
      catalogDescription: `Bibliotheekbron: ${entry.id}@${entry.version}. ${draft.catalogDescription ?? entry.description}`,
    },
    source: Object.freeze({
      libraryEntryId: entry.id,
      libraryEntryVersion: entry.version,
      source: entry.source,
    }),
  });
}

export function findWorkflowTemplateUpgradeCandidates(entryId: string): readonly WorkflowTemplateUpgradeCandidate[] {
  const current = getWorkflowTemplateLibraryEntry(entryId);
  if (!current) return [];
  const currentSource = JSON.stringify(current.source);
  return Object.freeze(CURATED_LIBRARY
    .filter((entry) => JSON.stringify(entry.source) === currentSource && entry.version > current.version && entry.status === "curated")
    .map((entry) => Object.freeze({
      currentEntryId: current.id,
      currentVersion: current.version,
      nextEntryId: entry.id,
      nextVersion: entry.version,
      title: entry.title,
      tags: entry.tags,
    }))
    .sort((left, right) => left.nextVersion - right.nextVersion));
}
