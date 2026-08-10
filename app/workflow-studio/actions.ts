"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getFeatureFlagSnapshot } from "@/lib/feature-flags";
import { getIdentityContext } from "@/lib/identity/request";
import { sql } from "@/lib/db";
import { createWorkflowDefinitionService } from "@/lib/workflow-studio/definition-service";
import {
  createWorkflowFromSelection,
  parseWorkflowTemplateReference,
} from "@/lib/workflow-studio/draft-lifecycle";
import { updateWorkflowDraftInputSchema } from "@/lib/workflow-studio/definition-schema";
import type { WorkflowAutosaveRequest } from "@/lib/workflow-studio/workflow-autosave";
import {
  publishWorkflowInputSchema,
  reviewWorkflowInputSchema,
  submitForReviewInputSchema,
} from "@/lib/workflow-studio/definition-schema";

export type WorkflowReviewActionState = {
  success: boolean;
  code: string;
  message: string;
  decision?: "submitted" | "approved" | "rejected" | "published";
  contentHash?: string;
};

export type CreateWorkflowDraftState = {
  success: boolean;
  message: string;
  issues?: readonly string[];
};

export type UpdateWorkflowMetadataState = {
  success: boolean;
  message: string;
  revision?: string;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
};

export type AutosaveWorkflowGraphState = {
  success: boolean;
  code: "ok" | "invalid_input" | "revision_conflict" | "validation_failed" | "unavailable" | "error";
  message: string;
  revision?: string;
  issues?: readonly string[];
};

const createDraftFormSchema = z.object({
  name: z.string().trim().min(2, "Vul een naam van minimaal 2 tekens in.").max(200),
  slug: z.string().trim().min(1).max(120).regex(
    /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/,
    "De slug mag alleen kleine letters, cijfers, koppeltekens en underscores bevatten.",
  ),
  description: z.string().trim().max(2000),
  template: z.string().trim(),
});

function builderAvailable(): boolean {
  return getFeatureFlagSnapshot()["workflow_studio.builder"];
}

export async function autosaveWorkflowGraphAction(input: WorkflowAutosaveRequest): Promise<AutosaveWorkflowGraphState> {
  if (!builderAvailable()) return { success: false, code: "unavailable", message: "Workflow Studio is uitgeschakeld." };
  if (!sql) return { success: false, code: "unavailable", message: "De database is niet beschikbaar." };
  const parsed = updateWorkflowDraftInputSchema.safeParse(input);
  if (!parsed.success || !parsed.data.nodes || !parsed.data.edges || !parsed.data.roleBindings) {
    return { success: false, code: "invalid_input", message: "De lokale workflowdraft heeft een ongeldig opslagformaat." };
  }
  const identity = await getIdentityContext();
  const result = await createWorkflowDefinitionService(sql).updateDraft(identity, parsed.data);
  if (!result.ok) {
    return {
      success: false,
      code: result.code === "revision_conflict" ? "revision_conflict" : result.code === "validation_failed" ? "validation_failed" : "error",
      message: result.message,
      ...(result.issues ? { issues: result.issues.map((issue) => issue.message) } : {}),
    };
  }
  revalidatePath(`/workflow-studio/${parsed.data.definitionId}/edit`);
  revalidatePath("/workflow-studio");
  return { success: true, code: "ok", message: "Draft automatisch opgeslagen.", revision: result.value.version.revision };
}

export async function submitWorkflowForReviewAction(input: unknown): Promise<WorkflowReviewActionState> {
  if (!builderAvailable() || !sql) return { success: false, code: "unavailable", message: "Workflow Studio is niet beschikbaar." };
  const parsed = submitForReviewInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, code: "invalid_input", message: "De reviewaanvraag is ongeldig." };
  const result = await createWorkflowDefinitionService(sql).submitForReview(await getIdentityContext(), parsed.data);
  if (!result.ok) return { success: false, code: result.code, message: result.message };
  revalidatePath(`/workflow-studio/${parsed.data.definitionId}/edit`);
  return { success: true, code: "ok", message: "Revisie ter review aangeboden.", decision: "submitted" };
}

export async function reviewWorkflowDraftAction(input: unknown): Promise<WorkflowReviewActionState> {
  if (!builderAvailable() || !sql) return { success: false, code: "unavailable", message: "Workflow Studio is niet beschikbaar." };
  const parsed = reviewWorkflowInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, code: "invalid_input", message: parsed.error.issues.map((issue) => issue.message).join(" ") };
  const result = await createWorkflowDefinitionService(sql).review(await getIdentityContext(), parsed.data);
  if (!result.ok) return { success: false, code: result.code, message: result.message };
  revalidatePath(`/workflow-studio/${parsed.data.definitionId}/edit`);
  return {
    success: true,
    code: "ok",
    message: parsed.data.decision === "approved" ? "Revisie goedgekeurd." : "Revisie afgewezen.",
    decision: parsed.data.decision,
  };
}

export async function publishWorkflowDraftAction(input: unknown): Promise<WorkflowReviewActionState> {
  if (!builderAvailable() || !sql) return { success: false, code: "unavailable", message: "Workflow Studio is niet beschikbaar." };
  const parsed = publishWorkflowInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, code: "invalid_input", message: "Het publicatieverzoek is ongeldig." };
  const result = await createWorkflowDefinitionService(sql).publish(await getIdentityContext(), parsed.data);
  if (!result.ok) return { success: false, code: result.code, message: result.message };
  revalidatePath("/workflow-studio");
  revalidatePath("/change-catalog");
  return {
    success: true,
    code: "ok",
    message: "De workflowversie is onveranderbaar gepubliceerd.",
    decision: "published",
    contentHash: result.value.version.contentHash ?? undefined,
  };
}

const updateMetadataFormSchema = z.object({
  definitionId: z.string().uuid(),
  expectedRevision: z.coerce.number().int().positive(),
  name: z.string().trim().min(2, "Vul een naam van minimaal 2 tekens in.").max(200),
  slug: z.string().trim().min(1).max(120).regex(
    /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/,
    "Gebruik alleen kleine letters, cijfers, koppeltekens en underscores.",
  ),
  description: z.string().trim().min(10, "Beschrijf het doel in minimaal 10 tekens.").max(2000),
  category: z.enum(["change", "operations", "compliance", "data", "other"]),
  tags: z.string().transform((value, context) => {
    const tags = [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))];
    if (tags.length > 20 || tags.some((tag) => tag.length > 50)) {
      context.addIssue({ code: "custom", message: "Gebruik maximaal 20 tags van maximaal 50 tekens." });
      return z.NEVER;
    }
    return tags;
  }),
  catalogDescription: z.string().trim().min(10, "Vul een catalogusbeschrijving van minimaal 10 tekens in.").max(1000),
  baseCost: z.coerce.number().finite().min(0, "Basiskosten mogen niet negatief zijn."),
  perItemCost: z.union([z.literal(""), z.coerce.number().finite().min(0, "Kosten per item mogen niet negatief zijn.")]),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Gebruik een valutacode van drie letters."),
  costDescription: z.string().trim().max(500),
});

export async function updateWorkflowMetadataAction(
  _previous: UpdateWorkflowMetadataState,
  formData: FormData,
): Promise<UpdateWorkflowMetadataState> {
  if (!builderAvailable()) return { success: false, message: "Workflow Studio is uitgeschakeld." };
  if (!sql) return { success: false, message: "De database is niet beschikbaar." };

  const parsed = updateMetadataFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      success: false,
      message: "Controleer de verplichte metadata.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const identity = await getIdentityContext();
  const result = await createWorkflowDefinitionService(sql).updateDraft(identity, {
    definitionId: parsed.data.definitionId,
    expectedRevision: parsed.data.expectedRevision,
    metadata: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description,
      category: parsed.data.category,
      tags: parsed.data.tags,
      catalogDescription: parsed.data.catalogDescription,
      costModel: {
        baseCost: parsed.data.baseCost,
        ...(parsed.data.perItemCost === "" ? {} : { perItemCost: parsed.data.perItemCost }),
        currency: parsed.data.currency.toUpperCase(),
        description: parsed.data.costDescription,
      },
    },
  });
  if (!result.ok) return { success: false, message: result.message };

  revalidatePath(`/workflow-studio/${parsed.data.definitionId}/edit`);
  revalidatePath("/workflow-studio");
  return {
    success: true,
    message: "Metadata opgeslagen.",
    revision: result.value.version.revision,
  };
}

export async function createWorkflowDraftAction(
  _previous: CreateWorkflowDraftState,
  formData: FormData,
): Promise<CreateWorkflowDraftState> {
  if (!builderAvailable()) return { success: false, message: "Workflow Studio is uitgeschakeld." };
  if (!sql) return { success: false, message: "De database is niet beschikbaar." };

  const parsed = createDraftFormSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description") ?? "",
    template: formData.get("template") ?? "",
  });
  if (!parsed.success) {
    return {
      success: false,
      message: "Controleer de ingevulde workflowgegevens.",
      issues: parsed.error.issues.map((issue) => issue.message),
    };
  }

  const template = parsed.data.template
    ? parseWorkflowTemplateReference(parsed.data.template)
    : null;
  if (parsed.data.template && !template) {
    return { success: false, message: "De gekozen templateverwijzing is ongeldig." };
  }

  const identity = await getIdentityContext();
  const service = createWorkflowDefinitionService(sql);
  const result = await createWorkflowFromSelection(service, identity, {
    name: parsed.data.name,
    slug: parsed.data.slug,
    description: parsed.data.description,
    ...(template ? { template } : {}),
  });
  if (!result.ok) {
    return {
      success: false,
      message: result.message,
      ...(result.issues ? { issues: result.issues.map((issue) => issue.message) } : {}),
    };
  }

  revalidatePath("/workflow-studio");
  redirect(`/workflow-studio/${result.value.definition.id}/edit`);
}

const deprecateFormSchema = z.object({ definitionId: z.string().uuid() });

export async function deprecateWorkflowAction(formData: FormData): Promise<void> {
  if (!builderAvailable()) redirect("/");
  if (!sql) redirect("/workflow-studio?error=database-niet-beschikbaar");

  const parsed = deprecateFormSchema.safeParse({ definitionId: formData.get("definitionId") });
  if (!parsed.success) redirect("/workflow-studio?error=ongeldige-workflow");

  const identity = await getIdentityContext();
  const service = createWorkflowDefinitionService(sql);
  const result = await service.deprecate(identity, parsed.data);
  if (!result.ok) {
    redirect(`/workflow-studio?error=${encodeURIComponent(result.message)}`);
  }

  revalidatePath("/workflow-studio");
  redirect("/workflow-studio?notice=workflow-uitgefaseerd");
}
