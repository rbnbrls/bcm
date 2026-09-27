import type { PublishedWorkflowCatalogItem } from "@/lib/workflow-studio/catalog";

/**
 * User-facing warning for /change-catalog when one or more published
 * workflows cannot be started.
 *
 * The summary is grammatically correct Dutch with dynamic pluralization
 * (singular "is", plural "zijn") and reflects the actual block reason from
 * the start-service denial instead of a generic scope/feature-flag excuse.
 * When all blocked workflows share one known reason, the reason is embedded
 * as a natural "omdat …" clause; otherwise the summary stays generic and the
 * per-workflow reasons are carried in `blockedWorkflows`.
 */
export type BlockedWorkflowWarning = Readonly<{
  summary: string;
  blockedWorkflows: readonly Readonly<{
    name: string;
    slug: string;
    versionNumber: number;
    reason: string;
  }>[];
}>;

/**
 * Curated mapping of the known start-service denial messages to a natural
 * "omdat …" subordinate clause. Only exact matches are embedded; unknown
 * reasons fall back to the generic summary plus the per-workflow list.
 */
const BLOCKED_REASON_CLAUSES: Readonly<Record<string, string>> = {
  "De gebruiker mist de vereiste Workflow Studio-permissie.":
    "omdat je de vereiste Workflow Studio-permissie mist",
  "De workflow ligt buiten jouw scope.":
    "omdat de workflow buiten jouw scope ligt",
  "Workflow runtime start is niet ingeschakeld.":
    "omdat Workflow-runtime starten niet is ingeschakeld",
  "Workflow runtime is niet actief voor deze versie.":
    "omdat de workflow-runtime niet actief is voor deze versie",
};

export function buildBlockedWorkflowWarning(
  items: readonly PublishedWorkflowCatalogItem[],
): BlockedWorkflowWarning | null {
  const blocked = items.filter((item) => !item.startable);
  if (blocked.length === 0) return null;

  const blockedWorkflows = blocked.map((item) => ({
    name: item.definition.name,
    slug: item.definition.slug,
    versionNumber: item.version.versionNumber,
    reason: item.blockedReason ?? "onbekend",
  }));

  const noun = blocked.length === 1 ? "gepubliceerde workflow" : "gepubliceerde workflows";
  const verb = blocked.length === 1 ? "is" : "zijn";
  const distinctReasons = [...new Set(blockedWorkflows.map((item) => item.reason))];
  const clause = distinctReasons.length === 1 ? BLOCKED_REASON_CLAUSES[distinctReasons[0]] : null;

  const summary = clause
    ? `${blocked.length} ${noun} ${verb} nog niet startbaar ${clause}.`
    : `${blocked.length} ${noun} ${verb} nog niet startbaar.`;

  return { summary, blockedWorkflows };
}
