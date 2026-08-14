import type { IdentityContext } from "@/lib/identity/types";
import { randomUUID } from "node:crypto";
import { DEFAULT_CHANGE_TYPE_CONFIGS } from "@/lib/db";
import type { ChangeTypeConfig } from "@/lib/types";
import { compileLegacyChangeType } from "@/lib/workflow-studio/compatibility-compiler";
import type {
  CreateWorkflowDraftInput,
  WorkflowEdgeInput,
  WorkflowNodeInput,
  WorkflowRoleBindingInput,
} from "@/lib/workflow-studio/definition-schema";
import type { WorkflowFormField } from "@/lib/workflow-studio/form-schema";
import type { WorkflowChangeRequestAttributeMapping } from "@/lib/workflow-studio/change-request-schema";

export const BUILTIN_WORKFLOW_TEMPLATE_IDS = [
  "benchmark_switch",
  "sub_asset_class_switch",
  "manager_switch",
  "portfolio_configuration_create",
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
    id: "sub_asset_class_switch",
    label: "Sub asset class wissel",
    description: "Wijzig de sub asset class inclusief bovenliggende asset class vanuit de service catalogus.",
  },
  {
    id: "manager_switch",
    label: "Manager wissel",
    description: "Wijzig de manager van een bestaande portfolio_configuration met catalogusvalidatie en akkoord.",
  },
  {
    id: "portfolio_configuration_create",
    label: "Nieuwe portfolio aanvragen",
    description: "Vraag een nieuwe portfolio_configuration voor een bestaande klant aan vanuit de service catalogus.",
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

type PortfolioConfigurationTemplateSpec = Readonly<{
  id: Exclude<BuiltinWorkflowTemplateId, "generic_field_change">;
  name: string;
  description: string;
  operation: "CREATE" | "UPDATE";
  tags: readonly string[];
  formFields: readonly WorkflowFormField[];
  mappings: readonly WorkflowChangeRequestAttributeMapping[];
}>;

const CODE_PATTERNS = Object.freeze({
  primaryAccountId: "^[A-Z0-9]{1,3}[*][A-Z]{2}[A-Z]{3}[*][A-Z0-9]{3}$",
  clientCode: "^[A-Z0-9]{1,3}$",
  portfolioCode: "^[A-Z0-9]{2,15}$",
  assetClassCode: "^[A-Z]{2}$",
  subAssetClassCode: "^[A-Z]{3}$",
  managerCode: "^[A-Z0-9]{3}$",
});

function textField(
  id: string,
  label: string,
  helpText: string,
  pattern: string,
  maxLength: number,
): WorkflowFormField {
  return {
    id,
    label,
    type: "text",
    required: true,
    helpText,
    constraints: {
      minLength: 1,
      maxLength,
      pattern,
    },
  };
}

function dateField(id = "effective_date", label = "Ingangsdatum"): WorkflowFormField {
  return {
    id,
    label,
    type: "date",
    required: true,
    helpText: "Datum waarop de goedgekeurde configuratiewijziging ingaat.",
  };
}

function rationaleField(): WorkflowFormField {
  return {
    id: "rationale",
    label: "Reden wijziging",
    type: "longtext",
    required: true,
    helpText: "Leg de zakelijke reden en eventuele klantafspraak vast.",
    constraints: { minLength: 10, maxLength: 2_000 },
  };
}

function portfolioUpdateBaseFields(): readonly WorkflowFormField[] {
  return [
    textField(
      "primary_account_id",
      "Bestaande primary account-ID",
      "Selecteer de bestaande portfolio_configuration regel; dit is de primaire sleutel.",
      CODE_PATTERNS.primaryAccountId,
      13,
    ),
  ];
}

function specForTemplate(templateId: PortfolioConfigurationTemplateSpec["id"]): PortfolioConfigurationTemplateSpec {
  if (templateId === "benchmark_switch") {
    return {
      id: templateId,
      name: "Benchmarkwissel",
      description: "Change manager vraagt een benchmarkwissel aan op een bestaande portfolio_configuration; account manager keurt de IST/SOLL-wijziging goed.",
      operation: "UPDATE",
      tags: ["template", "portfolio_configuration", "benchmark", "service-catalog"],
      formFields: [
        ...portfolioUpdateBaseFields(),
        textField("current_benchmark_code", "Huidige benchmark (IST)", "Vastgelegd uit de huidige portfolio_configuration.", "^[^\\r\\n]{1,60}$", 60),
        textField("requested_benchmark_code", "Nieuwe benchmark (SOLL)", "Kies een bestaande benchmark uit de service catalogus.", "^[^\\r\\n]{1,60}$", 60),
        dateField(),
        rationaleField(),
      ],
      mappings: [{
        attributeId: "benchmark_code",
        ist: { snapshotVariableId: "primary_account_id", snapshotAttributeId: "benchmark_code" },
        soll: { variableId: "requested_benchmark_code" },
      }],
    };
  }
  if (templateId === "sub_asset_class_switch") {
    return {
      id: templateId,
      name: "Sub asset class wissel",
      description: "Change manager vraagt een nieuwe sub asset class inclusief bovenliggende asset class aan; account manager keurt de IST/SOLL-wijziging goed.",
      operation: "UPDATE",
      tags: ["template", "portfolio_configuration", "asset-class", "service-catalog"],
      formFields: [
        ...portfolioUpdateBaseFields(),
        textField("current_asset_class_code", "Huidige asset class (IST)", "Vastgelegd uit de huidige portfolio_configuration.", CODE_PATTERNS.assetClassCode, 2),
        textField("requested_asset_class_code", "Nieuwe asset class (SOLL)", "Kies een bestaande asset class uit de service catalogus.", CODE_PATTERNS.assetClassCode, 2),
        textField("current_sub_asset_class_code", "Huidige sub asset class (IST)", "Vastgelegd uit de huidige portfolio_configuration.", CODE_PATTERNS.subAssetClassCode, 3),
        textField("requested_sub_asset_class_code", "Nieuwe sub asset class (SOLL)", "Kies een bestaande sub asset class die hoort bij de gekozen asset class.", CODE_PATTERNS.subAssetClassCode, 3),
        dateField(),
        rationaleField(),
      ],
      mappings: [
        {
          attributeId: "asset_class_code",
          ist: { snapshotVariableId: "primary_account_id", snapshotAttributeId: "asset_class_code" },
          soll: { variableId: "requested_asset_class_code" },
        },
        {
          attributeId: "sub_asset_class_code",
          ist: { snapshotVariableId: "primary_account_id", snapshotAttributeId: "sub_asset_class_code" },
          soll: { variableId: "requested_sub_asset_class_code" },
        },
      ],
    };
  }
  if (templateId === "manager_switch") {
    return {
      id: templateId,
      name: "Manager wissel",
      description: "Change manager vraagt een managerwijziging aan op een bestaande portfolio_configuration; account manager keurt goed.",
      operation: "UPDATE",
      tags: ["template", "portfolio_configuration", "manager", "service-catalog"],
      formFields: [
        ...portfolioUpdateBaseFields(),
        textField("current_manager_code", "Huidige manager (IST)", "Vastgelegd uit de huidige portfolio_configuration.", CODE_PATTERNS.managerCode, 3),
        textField("requested_manager_code", "Nieuwe manager (SOLL)", "Kies een bestaande manager uit de service catalogus.", CODE_PATTERNS.managerCode, 3),
        dateField(),
        rationaleField(),
      ],
      mappings: [{
        attributeId: "manager_code",
        ist: { snapshotVariableId: "primary_account_id", snapshotAttributeId: "manager_code" },
        soll: { variableId: "requested_manager_code" },
      }],
    };
  }
  return {
    id: templateId,
    name: "Nieuwe portfolio aanvragen",
    description: "Change manager vraagt een nieuwe portfolio_configuration aan voor een bestaande klant; account manager keurt alle catalogusdimensies goed.",
    operation: "CREATE",
    tags: ["template", "portfolio_configuration", "create", "service-catalog"],
    formFields: [
      textField("client_code", "Klantcode", "Bestaande klant waarvoor de nieuwe portfolio wordt aangevraagd.", CODE_PATTERNS.clientCode, 3),
      textField("portfolio_code", "Portfoliocode", "Bestaande of nieuw te koppelen portfoliocode binnen de klant.", CODE_PATTERNS.portfolioCode, 15),
      textField("asset_class_code", "Asset class", "Kies een bestaande asset class uit de service catalogus.", CODE_PATTERNS.assetClassCode, 2),
      textField("sub_asset_class_code", "Sub asset class", "Kies een bestaande sub asset class uit de service catalogus.", CODE_PATTERNS.subAssetClassCode, 3),
      textField("manager_code", "Manager", "Kies een bestaande manager uit de service catalogus.", CODE_PATTERNS.managerCode, 3),
      textField("benchmark_code", "Benchmark", "Kies een bestaande benchmark uit de service catalogus.", "^[^\\r\\n]{1,60}$", 60),
      { id: "npc_classification_id", label: "NPC-classificatie", type: "number", required: true, helpText: "Kies een bestaande NPC-classificatie.", constraints: { min: 1, step: 1 } },
      textField("long_name", "Lange naam", "Volledige naam van de portfolio_configuration.", "^[^\\r\\n]{1,255}$", 255),
      textField("short_name", "Korte naam", "Beknopte naam van de portfolio_configuration.", "^[^\\r\\n]{1,100}$", 100),
      dateField("effective_from", "Geldig vanaf"),
      rationaleField(),
    ],
    mappings: [
      "client_code",
      "portfolio_code",
      "asset_class_code",
      "sub_asset_class_code",
      "manager_code",
      "benchmark_code",
      "npc_classification_id",
      "long_name",
      "short_name",
      "effective_from",
    ].map((attributeId) => ({
      attributeId,
      soll: { variableId: attributeId },
    })),
  };
}

function edge(source: WorkflowNodeInput, target: WorkflowNodeInput, sourcePort = "out"): WorkflowEdgeInput {
  return {
    id: randomUUID(),
    edgeKey: `${source.nodeKey}_to_${target.nodeKey}`,
    sourceNodeId: source.id!,
    sourcePort,
    targetNodeId: target.id!,
    targetPort: "in",
  };
}

function roleBinding(
  workflowRole: "change_manager" | "account_manager",
  permission: WorkflowRoleBindingInput["permissions"][number],
  scope: { tenant: string; businessUnit: string; clientIds?: readonly string[] },
): WorkflowRoleBindingInput {
  return {
    workflowRole,
    identityGroup: `bcm:role:${workflowRole}`,
    permissions: [permission],
    tenant: scope.tenant,
    businessUnit: scope.businessUnit,
    ...(scope.clientIds && scope.clientIds.length > 0 ? { clientIds: [...scope.clientIds] } : {}),
  };
}

function buildPortfolioConfigurationTemplateDraft(
  templateId: PortfolioConfigurationTemplateSpec["id"],
  scope: { tenant: string; businessUnit: string; clientIds?: readonly string[] },
): CreateWorkflowDraftInput {
  const spec = specForTemplate(templateId);
  const start: WorkflowNodeInput = {
    id: randomUUID(),
    nodeKey: "start",
    block: { blockType: "manual_start", contractVersion: 1 },
    configuration: {
      label: spec.name,
      starterRoleIds: ["change_manager"],
      dataScope: "requester_scope",
    },
    position: { x: 80, y: 180 },
  };
  const requestForm: WorkflowNodeInput = {
    id: randomUUID(),
    nodeKey: "request_form",
    block: { blockType: "form", contractVersion: 1 },
    configuration: {
      title: spec.name,
      description: "Gebruik uitsluitend beschikbare waarden uit de service catalogus. portfolio_configuration blijft de bron voor klantproducten.",
      fields: spec.formFields,
    },
    position: { x: 360, y: 180 },
  };
  const approval: WorkflowNodeInput = {
    id: randomUUID(),
    nodeKey: "account_manager_approval",
    block: { blockType: "approval", contractVersion: 1 },
    configuration: {
      roleId: "account_manager",
      title: "Goedkeuring account manager",
      instructions: "Controleer de voorgestelde IST/SOLL-wijziging, service-cataloguswaarden en ingangsdatum voordat je akkoord geeft.",
      inputVariables: spec.formFields.map((field) => field.id),
      requireCommentOnApprove: true,
      requireCommentOnReject: true,
      requireCommentOnReturn: true,
    },
    position: { x: 650, y: 180 },
  };
  const changeRequest: WorkflowNodeInput = {
    id: randomUUID(),
    nodeKey: "stage_portfolio_configuration_change",
    block: { blockType: "change_request", contractVersion: 1 },
    configuration: {
      resourceId: "portfolio_configuration",
      operation: spec.operation,
      attributeMappings: spec.mappings,
      effectiveDateVariable: spec.operation === "CREATE" ? "effective_from" : "effective_date",
      rationaleVariable: "rationale",
    },
    position: { x: 940, y: 180 },
  };
  const completed: WorkflowNodeInput = {
    id: randomUUID(),
    nodeKey: "completed",
    block: { blockType: "end", contractVersion: 1 },
    configuration: { outcome: "completed", label: "Change gestaged" },
    position: { x: 1240, y: 140 },
  };
  const rejected: WorkflowNodeInput = {
    id: randomUUID(),
    nodeKey: "rejected",
    block: { blockType: "end", contractVersion: 1 },
    configuration: { outcome: "rejected", label: "Afgewezen" },
    position: { x: 940, y: 320 },
  };
  const nodes = [start, requestForm, approval, changeRequest, completed, rejected];
  return {
    scope: {
      tenant: scope.tenant,
      businessUnit: scope.businessUnit,
      ...(scope.clientIds && scope.clientIds.length > 0 ? { clientIds: [...scope.clientIds] } : {}),
    },
    name: spec.name,
    slug: spec.id,
    description: spec.description,
    category: "change",
    tags: [...spec.tags],
    catalogDescription: `${spec.description} Mutaties verlopen via Workflow Runtime en de governed portfolio_configuration staging.`,
    costModel: {
      baseCost: spec.operation === "CREATE" ? 1_500 : 750,
      currency: "EUR",
      description: "Interne afhandelingskosten voor portfolio_configuration workflow.",
    },
    nodes,
    edges: [
      edge(start, requestForm),
      edge(requestForm, approval),
      edge(approval, changeRequest, "approved"),
      edge(approval, rejected, "rejected"),
      edge(changeRequest, completed),
    ],
    roleBindings: [
      roleBinding("change_manager", "workflow:start", scope),
      roleBinding("account_manager", "workflow:approve", scope),
    ],
  };
}

export function buildBuiltinWorkflowTemplateDraft(
  templateId: BuiltinWorkflowTemplateId,
  identity: IdentityContext,
  scope: { tenant: string; businessUnit: string; clientIds?: readonly string[] },
): CreateWorkflowDraftInput {
  if (templateId !== "generic_field_change") {
    return buildPortfolioConfigurationTemplateDraft(templateId, scope);
  }

  const legacySlug = "fee_change";
  const canonical = DEFAULT_CHANGE_TYPE_CONFIGS.find((candidate) => candidate.slug === legacySlug);
  if (!canonical) throw new Error(`Ontbrekende canonieke configuratie voor template ${templateId}.`);
  const config: ChangeTypeConfig = {
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
  };
  const compiled = compileLegacyChangeType({ identity, config, scope });
  const definition = BUILTIN_WORKFLOW_TEMPLATES.find((candidate) => candidate.id === templateId)!;
  return {
    ...compiled.draft,
    name: definition.label,
    slug: templateId,
    category: "change",
    tags: ["template", "generiek", "ist-soll"],
    catalogDescription: definition.description,
    costModel: {
      baseCost: config.cost.baseCost,
      ...(config.cost.perItemCost !== undefined ? { perItemCost: config.cost.perItemCost } : {}),
      currency: config.cost.costCurrency,
      description: config.cost.description,
    },
  };
}
