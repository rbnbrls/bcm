import { z } from "zod";
import type { IdentityContext } from "@/lib/identity/types";
import { identityHasPermission, type WorkflowPermission } from "@/lib/rbac";
import {
  BlockContractResolver,
  defineBlockDefinition,
  type BlockCapability,
  type BlockConfigurationUiSchema,
  type BlockDefinition,
  type BlockPortDefinition,
  type BlockReference,
  type BlockUiMetadata,
} from "@/lib/workflow-studio/block-contract";
import { workflowFormBlockConfigurationSchema } from "@/lib/workflow-studio/form-schema";
import { workflowLookupConfigurationSchema } from "@/lib/workflow-studio/lookup-schema";
import { workflowChangeRequestConfigurationSchema } from "@/lib/workflow-studio/change-request-schema";
import { workflowDecisionConfigurationSchema } from "@/lib/workflow-studio/decision-schema";
import { workflowNotificationConfigurationSchema } from "@/lib/workflow-studio/notification-schema";

export const INITIAL_BLOCK_TYPES = [
  "manual_start",
  "end",
  "form",
  "role_task",
  "approval",
  "client_config_lookup",
  "change_request",
  "decision",
  "notification",
] as const;

export type InitialBlockType = (typeof INITIAL_BLOCK_TYPES)[number];

export type BlockCatalogEntry = {
  blockType: string;
  contractVersion: number;
  configurationSchema: Readonly<Record<string, unknown>>;
  configurationUiSchema: BlockConfigurationUiSchema;
  inputs: readonly BlockPortDefinition[];
  outputs: readonly BlockPortDefinition[];
  capabilities: readonly BlockCapability[];
  ui: BlockUiMetadata;
};

type RegistryEntry = {
  definition: BlockDefinition;
  requiredPermissions: readonly WorkflowPermission[];
  catalogEntry: BlockCatalogEntry;
};

const allFlowSources = INITIAL_BLOCK_TYPES.filter((blockType) => blockType !== "end");
const allFlowTargets = INITIAL_BLOCK_TYPES.filter((blockType) => blockType !== "manual_start");

const flowInput = (id = "in", label = "In"): BlockPortDefinition => ({
  id,
  label,
  valueType: "flow",
  required: true,
  maxConnections: 1,
});

const flowOutput = (id = "out", label = "Uit"): BlockPortDefinition => ({
  id,
  label,
  valueType: "flow",
  required: true,
  maxConnections: 1,
});

function flowRules(inputs: readonly BlockPortDefinition[], outputs: readonly BlockPortDefinition[]) {
  return [
    ...inputs.map((port) => ({
      direction: "incoming" as const,
      portId: port.id,
      allowedBlockTypes: allFlowSources,
      allowedPortTypes: ["flow" as const],
    })),
    ...outputs.map((port) => ({
      direction: "outgoing" as const,
      portId: port.id,
      allowedBlockTypes: allFlowTargets,
      allowedPortTypes: ["flow" as const],
    })),
  ];
}

function defineFlowBlock<TSchema extends z.ZodType>(input: {
  blockType: InitialBlockType;
  configuration: TSchema;
  configurationUiSchema?: BlockConfigurationUiSchema;
  inputs?: readonly BlockPortDefinition[];
  outputs?: readonly BlockPortDefinition[];
  capabilities: readonly BlockCapability[];
  ui: BlockUiMetadata;
}) {
  const inputs = input.inputs ?? [flowInput()];
  const outputs = input.outputs ?? [flowOutput()];
  return defineBlockDefinition({
    ...input,
    contractVersion: 1,
    inputs,
    outputs,
    allowedConnections: flowRules(inputs, outputs),
    runtimeHandlerId: `workflow.${input.blockType}.v1`,
  });
}

const variableId = z.string().regex(
  /^[a-z][a-z0-9_]*$/,
  "Gebruik een stabiele snake_case variabele-ID.",
);
const roleId = z.string().regex(/^[a-z][a-z0-9_-]*$/, "Gebruik een geldige rol-ID.");
const catalogId = z.string().regex(
  /^[a-z][a-z0-9_.-]*$/,
  "Gebruik een stabiele catalogus-ID.",
);

const definitions = [
  defineFlowBlock({
    blockType: "manual_start",
    configuration: z.object({
      label: z.string().trim().min(1).max(80).default("Handmatige start"),
      starterRoleIds: z.array(roleId).min(1).max(20).default(["aanvrager"]),
      dataScope: z.enum(["workflow_default", "requester_scope"]).default("workflow_default"),
    }).strict(),
    configurationUiSchema: {
      fieldOrder: ["label", "starterRoleIds", "dataScope"],
      widgets: { label: "text", starterRoleIds: "workflow-role-multiselect", dataScope: "select" },
      labels: { label: "Label", starterRoleIds: "Starterrollen", dataScope: "Datascope" },
      enumLabels: { dataScope: { workflow_default: "Standaardscope van workflow", requester_scope: "Scope van aanvrager" } },
      helpText: {
        starterRoleIds: "Workflowrollen die een instance mogen starten.",
        dataScope: "Gebruik de standaardscope van de workflow of beperk bij start tot de scope van de aanvrager.",
      },
    },
    inputs: [],
    capabilities: ["start"],
    ui: {
      label: "Handmatige start",
      description: "Start een workflow op verzoek van een bevoegde gebruiker.",
      category: "control",
      icon: "play",
      order: 10,
    },
  }),
  defineFlowBlock({
    blockType: "end",
    configuration: z.object({
      outcome: z.enum(["completed", "rejected", "cancelled"]).default("completed"),
      label: z.string().trim().min(1).max(80).default("Einde"),
    }).strict(),
    configurationUiSchema: {
      fieldOrder: ["label", "outcome"],
      widgets: { label: "text", outcome: "select" },
      labels: { label: "Label", outcome: "Uitkomst" },
      enumLabels: { outcome: { completed: "Voltooid", rejected: "Afgewezen", cancelled: "Geannuleerd" } },
    },
    outputs: [],
    capabilities: ["end"],
    ui: {
      label: "Einde",
      description: "Sluit een workflowpad af met een expliciete uitkomst.",
      category: "control",
      icon: "circle-stop",
      order: 20,
    },
  }),
  defineFlowBlock({
    blockType: "form",
    configuration: workflowFormBlockConfigurationSchema,
    configurationUiSchema: {
      fieldOrder: ["title", "description", "fields"],
      widgets: { title: "text", description: "textarea", fields: "form-fields" },
    },
    capabilities: ["user_input"],
    ui: {
      label: "Formulier",
      description: "Vraagt gevalideerde gegevens aan een gebruiker.",
      category: "interaction",
      icon: "form-input",
      order: 30,
    },
  }),
  defineFlowBlock({
    blockType: "role_task",
    configuration: z.object({
      roleId,
      title: z.string().trim().min(1).max(120),
      instructions: z.string().trim().min(1).max(2_000),
      inputVariables: z.array(variableId).max(100).default([]),
      outputVariables: z.array(variableId).max(100).default([]),
      deadlineHours: z.number().int().positive().max(8_760).optional(),
    }).strict().superRefine((configuration, context) => {
      if (new Set(configuration.inputVariables).size !== configuration.inputVariables.length) context.addIssue({ code: "custom", path: ["inputVariables"], message: "Invoervariabelen moeten uniek zijn." });
      if (new Set(configuration.outputVariables).size !== configuration.outputVariables.length) context.addIssue({ code: "custom", path: ["outputVariables"], message: "Uitvoervariabelen moeten uniek zijn." });
      const overlap = configuration.outputVariables.filter((variable) => configuration.inputVariables.includes(variable));
      if (overlap.length > 0) context.addIssue({ code: "custom", path: ["outputVariables"], message: `Variabelen mogen niet tegelijk invoer en uitvoer zijn: ${overlap.join(", ")}.` });
    }),
    configurationUiSchema: {
      fieldOrder: ["roleId", "title", "instructions", "inputVariables", "outputVariables", "deadlineHours"],
      widgets: { roleId: "workflow-role", instructions: "textarea", inputVariables: "variable-multiselect", outputVariables: "variable-list", deadlineHours: "duration-hours" },
    },
    capabilities: ["human_task"],
    ui: {
      label: "Roltaak",
      description: "Wijst handmatig werk toe aan een workflowrol.",
      category: "interaction",
      icon: "user-check",
      order: 40,
    },
  }),
  defineFlowBlock({
    blockType: "approval",
    configuration: z.object({
      roleId,
      title: z.string().trim().min(1).max(120),
      instructions: z.string().trim().max(2_000).optional(),
      inputVariables: z.array(variableId).max(100).default([]),
      decisionLabels: z.object({
        approved: z.string().trim().min(1).max(80).default("Goedkeuren"),
        rejected: z.string().trim().min(1).max(80).default("Afwijzen"),
        returned: z.string().trim().min(1).max(80).default("Terugsturen"),
      }).strict().default({ approved: "Goedkeuren", rejected: "Afwijzen", returned: "Terugsturen" }),
      requireCommentOnApprove: z.boolean().default(false),
      requireCommentOnReject: z.boolean().default(true),
      requireCommentOnReturn: z.boolean().default(true),
    }).strict(),
    configurationUiSchema: {
      fieldOrder: ["roleId", "title", "instructions", "inputVariables", "decisionLabels", "requireCommentOnApprove", "requireCommentOnReject", "requireCommentOnReturn"],
      widgets: { roleId: "workflow-role", instructions: "textarea", inputVariables: "variable-multiselect", decisionLabels: "approval-decisions", requireCommentOnApprove: "checkbox", requireCommentOnReject: "checkbox", requireCommentOnReturn: "checkbox" },
    },
    outputs: [
      flowOutput("approved", "Goedgekeurd"),
      flowOutput("rejected", "Afgewezen"),
      flowOutput("returned", "Teruggestuurd"),
    ],
    capabilities: ["approval", "human_task"],
    ui: {
      label: "Goedkeuring",
      description: "Laat een bevoegde workflowrol een besluit nemen.",
      category: "interaction",
      icon: "badge-check",
      order: 50,
    },
  }),
  defineFlowBlock({
    blockType: "client_config_lookup",
    configuration: workflowLookupConfigurationSchema,
    configurationUiSchema: {
      fieldOrder: ["resourceId", "filters", "parentBinding", "displayFields", "selection", "outputVariable"],
      widgets: { resourceId: "data-catalog-resource", filters: "catalog-filters", parentBinding: "lookup-parent-binding", displayFields: "catalog-attribute-multiselect", selection: "select", outputVariable: "variable" },
    },
    capabilities: ["data_read"],
    ui: {
      label: "Client-config opzoeken",
      description: "Leest een beheerde resource uit de client-configcatalogus.",
      category: "data",
      icon: "database-search",
      order: 60,
    },
  }),
  defineFlowBlock({
    blockType: "change_request",
    configuration: workflowChangeRequestConfigurationSchema,
    configurationUiSchema: {
      fieldOrder: ["resourceId", "operation", "attributeMappings", "effectiveDateVariable", "rationaleVariable"],
      widgets: {
        resourceId: "data-catalog-resource",
        operation: "select",
        attributeMappings: "change-request-mappings",
        effectiveDateVariable: "variable",
        rationaleVariable: "variable",
      },
    },
    capabilities: ["change_intent"],
    ui: {
      label: "Wijzigingsverzoek",
      description: "Maakt een governed wijzigingsintentie voor client-config.",
      category: "change",
      icon: "file-pen",
      order: 70,
    },
  }),
  defineFlowBlock({
    blockType: "decision",
    configuration: workflowDecisionConfigurationSchema,
    configurationUiSchema: {
      fieldOrder: ["label", "rule"],
      widgets: { label: "text", rule: "safe-rule-builder" },
    },
    outputs: [flowOutput("matched", "Waar"), flowOutput("otherwise", "Onwaar")],
    capabilities: ["routing"],
    ui: {
      label: "Beslissing",
      description: "Routeert veilig op basis van een getypeerde conditie.",
      category: "control",
      icon: "split",
      order: 80,
    },
  }),
  defineFlowBlock({
    blockType: "notification",
    configuration: workflowNotificationConfigurationSchema,
    configurationUiSchema: {
      fieldOrder: ["recipientRoleIds", "channel", "trigger", "subjectTemplate", "messageTemplate", "templateVariables"],
      widgets: { recipientRoleIds: "workflow-role-multiselect", channel: "select", trigger: "select", subjectTemplate: "safe-template", messageTemplate: "safe-template", templateVariables: "variable-multiselect" },
    },
    capabilities: ["notification"],
    ui: {
      label: "Notificatie",
      description: "Stuurt een bericht via een beheerd communicatiekanaal.",
      category: "communication",
      icon: "bell",
      order: 90,
    },
  }),
] as const satisfies readonly BlockDefinition[];

const roleBindingBlocks = new Set<InitialBlockType>(["role_task", "approval", "notification"]);

function publicCatalogEntry(definition: BlockDefinition): BlockCatalogEntry {
  return Object.freeze({
    blockType: definition.blockType,
    contractVersion: definition.contractVersion,
    configurationSchema: definition.configurationSchema,
    configurationUiSchema: definition.configurationUiSchema,
    inputs: definition.inputs,
    outputs: definition.outputs,
    capabilities: definition.capabilities,
    ui: definition.ui,
  });
}

const entries: readonly RegistryEntry[] = Object.freeze(definitions.map((definition) => Object.freeze({
  definition,
  requiredPermissions: Object.freeze([
    "workflow:design" as const,
    ...(roleBindingBlocks.has(definition.blockType as InitialBlockType)
      ? ["workflow:manage" as const]
      : []),
  ]),
  catalogEntry: publicCatalogEntry(definition),
})));

export class BlockRegistry {
  readonly #entries: readonly RegistryEntry[];
  readonly contracts: BlockContractResolver;

  constructor(registryEntries: readonly RegistryEntry[]) {
    this.#entries = Object.freeze([...registryEntries]);
    this.contracts = new BlockContractResolver(registryEntries.map((entry) => entry.definition));
  }

  listForIdentity(identity: IdentityContext): readonly BlockCatalogEntry[] {
    return Object.freeze(this.#entries
      .filter((entry) => entry.requiredPermissions.every((permission) => (
        identityHasPermission(identity, permission)
      )))
      .map((entry) => entry.catalogEntry)
      .sort((left, right) => left.ui.order - right.ui.order));
  }

  getForIdentity(identity: IdentityContext, reference: BlockReference): BlockCatalogEntry | null {
    const entry = this.#entries.find(({ definition }) => (
      definition.blockType === reference.blockType
      && definition.contractVersion === reference.contractVersion
    ));
    if (!entry || !entry.requiredPermissions.every((permission) => identityHasPermission(identity, permission))) {
      return null;
    }
    return entry.catalogEntry;
  }
}

export const blockRegistry = new BlockRegistry(entries);
