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
import { workflowIntegrationConfigurationSchema } from "@/lib/workflow-studio/integration-schema";
import {
  workflowParallelJoinConfigurationSchema,
  workflowParallelSplitConfigurationSchema,
} from "@/lib/workflow-studio/parallel-gateway-schema";
import { workflowSubworkflowConfigurationSchema } from "@/lib/workflow-studio/subworkflow-schema";
import {
  workflowApprovalConfigurationSchema,
  workflowRoleTaskConfigurationSchema,
} from "@/lib/workflow-studio/runtime-human-schema";

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
  "parallel_split",
  "parallel_join",
  "subworkflow",
  "integration",
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

const multiFlowOutput = (id = "out", label = "Uit"): BlockPortDefinition => ({
  ...flowOutput(id, label),
  maxConnections: null,
});

const multiFlowInput = (id = "in", label = "In"): BlockPortDefinition => ({
  ...flowInput(id, label),
  maxConnections: null,
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
    configuration: workflowRoleTaskConfigurationSchema,
    configurationUiSchema: {
      fieldOrder: ["roleId", "title", "instructions", "inputVariables", "outputVariables", "deadlineHours", "deadlineCalendar"],
      widgets: { roleId: "workflow-role", instructions: "textarea", inputVariables: "variable-multiselect", outputVariables: "variable-list", deadlineHours: "duration-hours", deadlineCalendar: "business-calendar" },
      labels: { deadlineCalendar: "Werkdagenkalender" },
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
    configuration: workflowApprovalConfigurationSchema,
    configurationUiSchema: {
      fieldOrder: ["roleId", "title", "instructions", "inputVariables", "decisionLabels", "requireCommentOnApprove", "requireCommentOnReject", "requireCommentOnReturn", "approvalGroupId", "approvalMode", "quorum", "uniqueApprovers", "roleCombination", "escalationHours"],
      widgets: {
        roleId: "workflow-role",
        instructions: "textarea",
        inputVariables: "variable-multiselect",
        decisionLabels: "approval-decisions",
        requireCommentOnApprove: "checkbox",
        requireCommentOnReject: "checkbox",
        requireCommentOnReturn: "checkbox",
        approvalGroupId: "text",
        approvalMode: "select",
        quorum: "number",
        uniqueApprovers: "checkbox",
        roleCombination: "select",
        escalationHours: "number",
      },
      labels: {
        approvalGroupId: "Goedkeuringsgroep",
        approvalMode: "Besluitmodus",
        quorum: "Quorum",
        uniqueApprovers: "Unieke personen",
        roleCombination: "Rolcombinatie",
        escalationHours: "Escalatie na uren",
      },
      enumLabels: {
        approvalMode: { sequential: "Sequentieel", all_of: "Alle goedkeuringen", any_of: "Een van de goedkeuringen", quorum: "Quorum" },
        roleCombination: { distinct_roles: "Verschillende rollen", allow_repeated_roles: "Herhaalde rollen toestaan" },
      },
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
    blockType: "parallel_split",
    configuration: workflowParallelSplitConfigurationSchema,
    configurationUiSchema: {
      fieldOrder: ["label"],
      widgets: { label: "text" },
      labels: { label: "Label" },
    },
    outputs: [multiFlowOutput()],
    capabilities: ["routing"],
    ui: {
      label: "Parallel split",
      description: "Start meerdere branches tegelijk.",
      category: "control",
      icon: "git-fork",
      order: 85,
    },
  }),
  defineFlowBlock({
    blockType: "parallel_join",
    configuration: workflowParallelJoinConfigurationSchema,
    configurationUiSchema: {
      fieldOrder: ["label", "mode", "quorum"],
      widgets: { label: "text", mode: "select", quorum: "number" },
      labels: { label: "Label", mode: "Joinmodus", quorum: "Quorum" },
      enumLabels: { mode: { and: "AND", or: "OR", quorum: "Quorum" } },
    },
    inputs: [multiFlowInput()],
    capabilities: ["routing"],
    ui: {
      label: "Parallel join",
      description: "Wacht op parallelle branches met AND, OR of quorum.",
      category: "control",
      icon: "git-merge",
      order: 86,
    },
  }),
  defineFlowBlock({
    blockType: "subworkflow",
    configuration: workflowSubworkflowConfigurationSchema,
    configurationUiSchema: {
      fieldOrder: ["label", "childWorkflowVersionId", "pinnedVersionLabel", "inputMappings", "outputMappings", "nestingDepth"],
      widgets: {
        label: "text",
        childWorkflowVersionId: "workflow-version-reference",
        pinnedVersionLabel: "text",
        inputMappings: "variable-mapping",
        outputMappings: "variable-mapping",
        nestingDepth: "number",
      },
      labels: {
        label: "Label",
        childWorkflowVersionId: "Gepinde child-versie",
        pinnedVersionLabel: "Versielabel",
        inputMappings: "Inputmapping",
        outputMappings: "Outputmapping",
        nestingDepth: "Nestingdiepte",
      },
    },
    capabilities: ["routing"],
    ui: {
      label: "Subworkflow",
      description: "Roept een gepinde workflowversie aan met expliciete input- en outputmapping.",
      category: "control",
      icon: "workflow",
      order: 87,
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
  defineFlowBlock({
    blockType: "integration",
    configuration: workflowIntegrationConfigurationSchema,
    configurationUiSchema: {
      fieldOrder: ["connectorId", "connectorVersion", "operation", "inputSchemaVersion", "outputSchemaVersion", "inputVariables", "outputVariable", "secretRefs", "timeoutMs", "retryPolicy", "signing", "sandboxMode"],
      widgets: {
        connectorId: "select",
        connectorVersion: "number",
        operation: "text",
        inputSchemaVersion: "number",
        outputSchemaVersion: "number",
        inputVariables: "variable-multiselect",
        outputVariable: "variable",
        secretRefs: "secret-reference-list",
        timeoutMs: "number",
        retryPolicy: "retry-policy",
        signing: "signing-policy",
        sandboxMode: "checkbox",
      },
      labels: {
        connectorId: "Connector",
        connectorVersion: "Connectorversie",
        inputSchemaVersion: "Inputschemaversie",
        outputSchemaVersion: "Outputschemaversie",
        inputVariables: "Inputvariabelen",
        outputVariable: "Outputvariabele",
        secretRefs: "Secret references",
        timeoutMs: "Timeout (ms)",
        retryPolicy: "Retrybeleid",
        sandboxMode: "Sandboxmodus",
      },
      enumLabels: {
        connectorId: {
          "servicenow.create_ticket.v1": "ServiceNow ticket maken",
          "slack.post_message.v1": "Slack bericht plaatsen",
          "teams.post_message.v1": "Teams bericht plaatsen",
        },
      },
    },
    capabilities: ["integration"],
    ui: {
      label: "Integratie",
      description: "Stuurt een allowlisted connectoropdracht via de outbox zonder secrets bloot te geven.",
      category: "communication",
      icon: "plug",
      order: 95,
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
