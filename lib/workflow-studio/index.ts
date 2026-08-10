export {
  BUILTIN_WORKFLOW_TEMPLATE_IDS,
  BUILTIN_WORKFLOW_TEMPLATES,
  buildBuiltinWorkflowTemplateDraft,
  isBuiltinWorkflowTemplateId,
  type BuiltinWorkflowTemplateDefinition,
  type BuiltinWorkflowTemplateId,
} from "@/lib/workflow-studio/builtin-workflow-templates";

export {
  WorkflowDefinitionRepository,
  WorkflowRepositoryError,
  computeContentHash,
  type SqlExecutor,
  type WorkflowDefinitionRecord,
  type WorkflowDefinitionRow,
  type WorkflowEdgeRow,
  type WorkflowNodeRow,
  type WorkflowRepositoryErrorCode,
  type WorkflowRoleBindingRow,
  type WorkflowVersionRow,
  type WorkflowVersionSnapshot,
  type WorkflowVersionReviewRow,
  type WorkflowReviewDecision,
} from "@/lib/workflow-studio/definition-repository";

export {
  WorkflowDefinitionService,
  createWorkflowDefinitionService,
  type WorkflowServiceCode,
  type WorkflowServiceIssue,
  type WorkflowServiceResult,
} from "@/lib/workflow-studio/definition-service";

export {
  cloneWorkflowInputSchema,
  createWorkflowDraftInputSchema,
  deprecateWorkflowInputSchema,
  loadWorkflowInputSchema,
  publishWorkflowInputSchema,
  reviewWorkflowInputSchema,
  submitForReviewInputSchema,
  updateWorkflowDraftInputSchema,
  workflowDataScopeInputSchema,
  workflowDraftMetadataSchema,
  workflowEdgeInputSchema,
  workflowNodeInputSchema,
  workflowRoleBindingInputSchema,
  workflowRuntimePermissionSchema,
  type CloneWorkflowInput,
  type CreateWorkflowDraftInput,
  type DeprecateWorkflowInput,
  type LoadWorkflowInput,
  type PublishWorkflowInput,
  type ReviewWorkflowInput,
  type SubmitForReviewInput,
  type UpdateWorkflowDraftInput,
  type WorkflowDataScopeInput,
  type WorkflowDraftMetadata,
  type WorkflowEdgeInput,
  type WorkflowNodeInput,
  type WorkflowRoleBindingInput,
  type WorkflowRuntimePermission,
} from "@/lib/workflow-studio/definition-schema";

export {
  WORKFLOW_VALIDATOR_VERSION,
  WorkflowValidator,
  createWorkflowValidator,
  unacknowledgedWorkflowWarnings,
  type WorkflowValidationInput,
  type WorkflowValidationIssue,
  type WorkflowValidationIssueCode,
  type WorkflowValidationResult,
  type WorkflowValidationSeverity,
} from "@/lib/workflow-studio/workflow-validator";

export {
  createWorkflowReviewDiff,
  type WorkflowReviewChange,
  type WorkflowReviewChangeKind,
  type WorkflowReviewDiff,
} from "@/lib/workflow-studio/workflow-review";

export {
  createWorkflowFormSubmissionSchema,
  validateWorkflowFormSubmission,
  workflowFormBlockConfigurationSchema,
  workflowFormFieldSchema,
  workflowFormFieldTypeSchema,
  type WorkflowFormBlockConfiguration,
  type WorkflowFormField,
  type WorkflowFormFieldType,
} from "@/lib/workflow-studio/form-schema";

export {
  workflowLookupConfigurationSchema,
  workflowLookupFilterSchema,
  workflowLookupParentBindingSchema,
  type WorkflowLookupConfiguration,
  type WorkflowLookupFilter,
  type WorkflowLookupParentBinding,
} from "@/lib/workflow-studio/lookup-schema";

export {
  workflowChangeRequestAttributeMappingSchema,
  workflowChangeRequestConfigurationSchema,
  workflowChangeRequestOperationSchema,
  type WorkflowChangeRequestAttributeMapping,
  type WorkflowChangeRequestConfiguration,
  type WorkflowChangeRequestOperation,
} from "@/lib/workflow-studio/change-request-schema";

export {
  evaluateWorkflowDecision,
  workflowDecisionConfigurationSchema,
  workflowDecisionOperatorSchema,
  workflowDecisionRuleSchema,
  workflowDecisionValueTypeSchema,
  type WorkflowDecisionCondition,
  type WorkflowDecisionConfiguration,
  type WorkflowDecisionEvaluation,
  type WorkflowDecisionGroup,
  type WorkflowDecisionOperator,
  type WorkflowDecisionRule,
  type WorkflowDecisionValueType,
} from "@/lib/workflow-studio/decision-schema";

export {
  escapeWorkflowNotificationValue,
  extractWorkflowTemplateVariables,
  renderWorkflowNotification,
  workflowNotificationChannelSchema,
  workflowNotificationConfigurationSchema,
  workflowNotificationTriggerSchema,
  type WorkflowNotificationChannel,
  type WorkflowNotificationConfiguration,
  type WorkflowNotificationRenderResult,
  type WorkflowNotificationTrigger,
} from "@/lib/workflow-studio/notification-schema";

export {
  collectWorkflowVariableOptions,
  orderedContractProperties,
  validateContractConfiguration,
  type ContractPropertyIssue,
  type JsonSchema,
  type WorkflowVariableOption,
} from "@/lib/workflow-studio/properties-schema";

export {
  buildWorkflowPreviewModel,
  workflowPreviewOperationLabel,
  type WorkflowPreviewChange,
  type WorkflowPreviewMetadata,
  type WorkflowPreviewModel,
  type WorkflowPreviewRole,
  type WorkflowPreviewRoleBinding,
  type WorkflowPreviewStep,
} from "@/lib/workflow-studio/workflow-preview";

export {
  collectWorkflowSimulationControls,
  simulateWorkflowPath,
  type WorkflowSimulationAuditEvent,
  type WorkflowSimulationControls,
  type WorkflowSimulationDecision,
  type WorkflowSimulationInput,
  type WorkflowSimulationIntent,
  type WorkflowSimulationResult,
  type WorkflowSimulationTaskOutcome,
} from "@/lib/workflow-studio/workflow-simulator";

export {
  WORKFLOW_AUTOSAVE_SCHEMA_VERSION,
  createWorkflowLocalDraftSnapshot,
  parseWorkflowLocalDraftSnapshot,
  toWorkflowAutosaveRequest,
  workflowGraphSignature,
  workflowLocalDraftStorageKey,
  type WorkflowAutosaveRequest,
  type WorkflowLocalDraftSnapshot,
} from "@/lib/workflow-studio/workflow-autosave";

export {
  COMPATIBILITY_COMPILER_VERSION,
  CompatibilityCompiler,
  compileLegacyChangeType,
  createCompatibilityCompiler,
  type CompatibilityCompileInput,
  type CompatibilityCompileResult,
  type CompilationChangeRequest,
  type CompilationFieldKind,
  type CompilationFieldMapping,
  type CompilationReport,
  type CompilationRoleBinding,
  type CompilationRoleKind,
} from "@/lib/workflow-studio/compatibility-compiler";

export {
  buildBlankWorkflowDraftInput,
  createWorkflowFromSelection,
  parseWorkflowTemplateReference,
  type CreateWorkflowSelection,
  type WorkflowTemplateReference,
} from "@/lib/workflow-studio/draft-lifecycle";

export {
  loadWorkflowOverview,
  type WorkflowOverviewItem,
} from "@/lib/workflow-studio/overview";

export {
  createWorkflowEditorNode,
  createWorkflowEditorHistory,
  commitWorkflowEditorGraph,
  undoWorkflowEditorGraph,
  redoWorkflowEditorGraph,
  canConnectWorkflowEditorPorts,
  connectWorkflowEditorPorts,
  removeWorkflowEditorEdge,
  autoLayoutWorkflowEditorGraph,
  moveWorkflowEditorNode,
  removeWorkflowEditorNode,
  validateWorkflowEditorShell,
  type WorkflowEditorEdge,
  type WorkflowEditorGraph,
  type WorkflowEditorHistory,
  type WorkflowEditorNode,
  type WorkflowEditorPosition,
  type WorkflowEditorPortReference,
  type WorkflowEditorConnectionDecision,
  type WorkflowEditorValidationIssue,
} from "@/lib/workflow-studio/editor-model";

export {
  applyWorkflowEditorQuickFix,
  validateWorkflowEditorDraft,
  type WorkflowEditorPanelIssue,
  type WorkflowEditorQuickFix,
  type WorkflowEditorValidationSummary,
} from "@/lib/workflow-studio/editor-validation";
