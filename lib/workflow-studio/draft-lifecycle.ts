import type { IdentityContext } from "@/lib/identity/types";
import type { WorkflowDefinitionService, WorkflowServiceResult } from "@/lib/workflow-studio/definition-service";
import type { CreateWorkflowDraftInput } from "@/lib/workflow-studio/definition-schema";
import type { WorkflowDefinitionRecord } from "@/lib/workflow-studio/definition-repository";
import { getIdentityClientScope } from "@/lib/workflow-studio-authorization";
import {
  buildBuiltinWorkflowTemplateDraft,
  isBuiltinWorkflowTemplateId,
  type BuiltinWorkflowTemplateId,
} from "@/lib/workflow-studio/builtin-workflow-templates";

export type WorkflowTemplateReference =
  | { kind: "definition"; id: string }
  | { kind: "version"; id: string }
  | { kind: "builtin"; id: BuiltinWorkflowTemplateId };

export type CreateWorkflowSelection = {
  name: string;
  slug: string;
  description?: string;
  template?: WorkflowTemplateReference;
};

export function parseWorkflowTemplateReference(value: string | null | undefined): WorkflowTemplateReference | null {
  if (!value) return null;
  const builtinMatch = /^builtin:([a-z0-9_]+)$/.exec(value);
  if (builtinMatch) {
    return isBuiltinWorkflowTemplateId(builtinMatch[1])
      ? { kind: "builtin", id: builtinMatch[1] }
      : null;
  }
  const match = /^(definition|version):([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(value);
  if (!match) return null;
  return { kind: match[1] as "definition" | "version", id: match[2] };
}

export function buildBlankWorkflowDraftInput(
  identity: IdentityContext,
  input: Omit<CreateWorkflowSelection, "template">,
): CreateWorkflowDraftInput | null {
  if (!identity.tenant || !identity.businessUnit) return null;
  const clientIds = getIdentityClientScope(identity);
  return {
    scope: {
      tenant: identity.tenant,
      businessUnit: identity.businessUnit,
      ...(clientIds ? { clientIds } : {}),
    },
    name: input.name,
    slug: input.slug,
    description: input.description ?? "",
    nodes: [
      {
        nodeKey: "start",
        block: { blockType: "manual_start", contractVersion: 1 },
        configuration: { label: "Start" },
        position: { x: 80, y: 160 },
      },
      {
        nodeKey: "end",
        block: { blockType: "end", contractVersion: 1 },
        configuration: { outcome: "completed", label: "Voltooid" },
        position: { x: 400, y: 160 },
      },
    ],
    edges: [
      {
        edgeKey: "start_to_end",
        sourceNodeId: "start",
        sourcePort: "out",
        targetNodeId: "end",
        targetPort: "in",
      },
    ],
    roleBindings: [],
  };
}

export async function createWorkflowFromSelection(
  service: WorkflowDefinitionService,
  identity: IdentityContext,
  input: CreateWorkflowSelection,
): Promise<WorkflowServiceResult<WorkflowDefinitionRecord>> {
  if (!identity.tenant || !identity.businessUnit) {
    return {
      ok: false,
      code: "identity_scope_missing",
      message: "De identiteit heeft geen tenant- en businessunit-scope.",
    };
  }

  const clientIds = getIdentityClientScope(identity);
  const scope = {
    tenant: identity.tenant,
    businessUnit: identity.businessUnit,
    ...(clientIds ? { clientIds } : {}),
  };

  if (input.template) {
    if (input.template.kind === "builtin") {
      const template = buildBuiltinWorkflowTemplateDraft(input.template.id, identity, scope);
      return service.createDraft(identity, {
        ...template,
        name: input.name,
        slug: input.slug,
        description: input.description?.trim() || template.description,
      });
    }
    return service.clone(identity, {
      ...(input.template.kind === "version"
        ? { sourceVersionId: input.template.id }
        : { sourceDefinitionId: input.template.id }),
      scope,
      slug: input.slug,
      metadata: { name: input.name, description: input.description ?? "" },
    });
  }

  const draft = buildBlankWorkflowDraftInput(identity, input);
  if (!draft) {
    return {
      ok: false,
      code: "identity_scope_missing",
      message: "De identiteit heeft geen tenant- en businessunit-scope.",
    };
  }
  return service.createDraft(identity, draft);
}
