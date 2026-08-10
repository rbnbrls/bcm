import type { IdentityContext } from "@/lib/identity/types";
import { DEFAULT_CHANGE_TYPE_CONFIGS } from "@/lib/db";
import type { ChangeTypeConfig } from "@/lib/types";
import { compileLegacyChangeType } from "@/lib/workflow-studio/compatibility-compiler";
import type { CreateWorkflowDraftInput } from "@/lib/workflow-studio/definition-schema";

export const BUILTIN_WORKFLOW_TEMPLATE_IDS = [
  "benchmark_switch",
  "generic_field_change",
] as const;

export type BuiltinWorkflowTemplateId = typeof BUILTIN_WORKFLOW_TEMPLATE_IDS[number];

export type BuiltinWorkflowTemplateDefinition = {
  id: BuiltinWorkflowTemplateId;
  label: string;
  description: string;
};

export const BUILTIN_WORKFLOW_TEMPLATES: readonly BuiltinWorkflowTemplateDefinition[] = Object.freeze([
  {
    id: "benchmark_switch",
    label: "Benchmarkwissel",
    description: "Portefeuille selecteren, IST-benchmark ophalen, SOLL-benchmark aanvragen en laten goedkeuren.",
  },
  {
    id: "generic_field_change",
    label: "Generieke veldwijziging",
    description: "Herbruikbaar IST/SOLL-formulier met controle- en goedkeuringsstappen voor een configureerbaar veld.",
  },
]);

export function isBuiltinWorkflowTemplateId(value: string): value is BuiltinWorkflowTemplateId {
  return (BUILTIN_WORKFLOW_TEMPLATE_IDS as readonly string[]).includes(value);
}

export function buildBuiltinWorkflowTemplateDraft(
  templateId: BuiltinWorkflowTemplateId,
  identity: IdentityContext,
  scope: { tenant: string; businessUnit: string; clientIds?: readonly string[] },
): CreateWorkflowDraftInput {
  const legacySlug = templateId === "benchmark_switch" ? "benchmark_switch" : "fee_change";
  const canonical = DEFAULT_CHANGE_TYPE_CONFIGS.find((candidate) => candidate.slug === legacySlug);
  if (!canonical) throw new Error(`Ontbrekende canonieke configuratie voor template ${templateId}.`);
  const config: ChangeTypeConfig = templateId === "generic_field_change" ? {
    ...canonical,
    slug: "generic_field_change",
    name: "Generieke veldwijziging",
    description: "Wijzig een configureerbaar veld met een expliciete IST- en SOLL-waarde.",
    category: "other",
    fields: [
      { key: "resource_reference", label: "Objectreferentie", type: "text", required: true },
      { key: "current_value", label: "Huidige waarde (IST)", type: "text", required: true, readOnly: true },
      { key: "requested_value", label: "Nieuwe waarde (SOLL)", type: "text", required: true },
      { key: "effective_date", label: "Ingangsdatum", type: "date", required: true },
      { key: "rationale", label: "Reden wijziging", type: "longtext", required: true },
    ],
    istSollMapping: [{
      ist: "current_value",
      soll: "requested_value",
      labelIst: "Huidige waarde (IST)",
      labelSoll: "Nieuwe waarde (SOLL)",
    }],
    workflow: "generic_field_change",
  } : canonical;
  const compiled = compileLegacyChangeType({ identity, config, scope });
  const definition = BUILTIN_WORKFLOW_TEMPLATES.find((candidate) => candidate.id === templateId)!;
  return {
    ...compiled.draft,
    name: definition.label,
    slug: templateId,
    category: "change",
    tags: templateId === "benchmark_switch"
      ? ["template", "benchmark", "ist-soll"]
      : ["template", "generiek", "ist-soll"],
    catalogDescription: definition.description,
    costModel: {
      baseCost: config.cost.baseCost,
      ...(config.cost.perItemCost !== undefined ? { perItemCost: config.cost.perItemCost } : {}),
      currency: config.cost.costCurrency,
      description: config.cost.description,
    },
  };
}
