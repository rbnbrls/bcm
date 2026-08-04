"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updateChangeTypeActive, updateChangeTypeConfig, updateChangeTypeDefinition } from "@/lib/change-types/repository";
import { requireAdmin } from "@/lib/admin-auth-request";
import {
  changeFieldSchema,
  editableChangeTypeDefinitionSchema,
  flowStepSchema,
  istSollMappingSchema,
  parseJsonFormValue,
  stakeholderDefSchema,
} from "@/lib/change-types/schema";

export type ChangeTypeAdminState = {
  message?: string;
  issues?: string[];
};

const optionalSlugSchema = z.preprocess(
  (value) => String(value ?? "").trim() || undefined,
  z.string().min(1, "Change type slug ontbreekt.").optional(),
);

const changeTypeIdentifierSchema = z.string().trim().min(1, "Change type ontbreekt.");

const changeTypeAdminSchema = z.object({
  id: changeTypeIdentifierSchema,
  slug: optionalSlugSchema,
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
  baseCost: z.coerce.number().min(0, "Basiskosten mogen niet negatief zijn."),
  perItemCost: z.preprocess(
    (value) => String(value ?? "").trim() === "" ? undefined : value,
    z.coerce.number().min(0, "Kosten per item mogen niet negatief zijn.").optional(),
  ),
  costCurrency: z.string().trim().length(3, "Valuta moet een 3-lettercode zijn.").toUpperCase(),
  costDescription: z.string().trim().max(200, "Kostentekst mag maximaal 200 tekens zijn."),
  defaultLeadDays: z.coerce.number().int().min(0, "Doorlooptijd mag niet negatief zijn.").max(365, "Doorlooptijd is maximaal 365 dagen."),
  sortOrder: z.coerce.number().int().min(0, "Volgorde mag niet negatief zijn."),
});

const changeTypeActiveSchema = z.object({
  id: changeTypeIdentifierSchema,
  slug: optionalSlugSchema,
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
});

const changeTypeDefinitionScalarSchema = z.object({
  id: changeTypeIdentifierSchema,
  slug: optionalSlugSchema,
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
  name: z.string().trim().min(1, "Naam is verplicht."),
  description: z.string().trim(),
  extendedExplanation: z.string().optional(),
  category: z.string().trim().min(1, "Categorie is verplicht."),
  workflow: z.string().trim().min(1, "Workflow template is verplicht."),
  baseCost: z.coerce.number().min(0, "Basiskosten mogen niet negatief zijn."),
  perItemCost: z.preprocess(
    (value) => String(value ?? "").trim() === "" ? undefined : value,
    z.coerce.number().min(0, "Kosten per item mogen niet negatief zijn.").optional(),
  ),
  costCurrency: z.string().trim().length(3, "Valuta moet een 3-lettercode zijn.").toUpperCase(),
  costDescription: z.string().trim().max(500, "Kostentekst mag maximaal 500 tekens zijn."),
  defaultLeadDays: z.coerce.number().int().min(0, "Doorlooptijd mag niet negatief zijn.").max(365, "Doorlooptijd is maximaal 365 dagen."),
  sortOrder: z.coerce.number().int().min(0, "Volgorde mag niet negatief zijn."),
});

function normalizeActiveValue(formData: FormData): "true" | "false" {
  return formData
    .getAll("active")
    .some((value) => ["true", "on", "1"].includes(String(value).toLowerCase()))
    ? "true"
    : "false";
}

function revalidateChangeTypeFrontend() {
  revalidatePath("/admin/change-types");
  revalidatePath("/change-catalog");
  revalidatePath("/changes/new");
}

export async function updateChangeTypeAdmin(
  _: ChangeTypeAdminState,
  formData: FormData,
): Promise<ChangeTypeAdminState> {
  const auth = await requireAdmin();
  if (!auth.authorized) {
    return { issues: [auth.message] };
  }

  const rawInput = Object.fromEntries(formData);
  rawInput.active = normalizeActiveValue(formData);

  const parsed = changeTypeAdminSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { issues: parsed.error.issues.map((issue) => issue.message) };
  }

  try {
    await updateChangeTypeConfig({
      id: parsed.data.id,
      slug: parsed.data.slug,
      active: parsed.data.active,
      cost: {
        baseCost: parsed.data.baseCost,
        costCurrency: parsed.data.costCurrency,
        perItemCost: parsed.data.perItemCost,
        description: parsed.data.costDescription,
      },
      defaultLeadDays: parsed.data.defaultLeadDays,
      sortOrder: parsed.data.sortOrder,
    });
  } catch (error) {
    return {
      issues: [
        error instanceof Error ? error.message : "Change type kon niet worden opgeslagen.",
      ],
    };
  }

  revalidateChangeTypeFrontend();
  return { message: "Change type opgeslagen." };
}

export async function updateChangeTypeActiveAdmin(
  _: ChangeTypeAdminState,
  formData: FormData,
): Promise<ChangeTypeAdminState> {
  const auth = await requireAdmin();
  if (!auth.authorized) {
    return { issues: [auth.message] };
  }

  const rawInput = Object.fromEntries(formData);
  rawInput.active = normalizeActiveValue(formData);

  const parsed = changeTypeActiveSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { issues: parsed.error.issues.map((issue) => issue.message) };
  }

  try {
    await updateChangeTypeActive({
      id: parsed.data.id,
      slug: parsed.data.slug,
      active: parsed.data.active,
    });
  } catch (error) {
    return {
      issues: [
        error instanceof Error ? error.message : "Status kon niet worden opgeslagen.",
      ],
    };
  }

  revalidateChangeTypeFrontend();
  return { message: parsed.data.active ? "Actief gemaakt." : "Inactief gemaakt." };
}

export async function updateChangeTypeDefinitionAdmin(
  _: ChangeTypeAdminState,
  formData: FormData,
): Promise<ChangeTypeAdminState> {
  const auth = await requireAdmin();
  if (!auth.authorized) {
    return { issues: [auth.message] };
  }

  const rawInput = Object.fromEntries(formData);
  rawInput.active = normalizeActiveValue(formData);

  const parsedScalars = changeTypeDefinitionScalarSchema.safeParse(rawInput);
  if (!parsedScalars.success) {
    return { issues: parsedScalars.error.issues.map((issue) => issue.message) };
  }

  const fields = parseJsonFormValue(
    formData.get("fieldsJson"),
    z.array(changeFieldSchema),
    "Velden",
  );
  const istSollMapping = parseJsonFormValue(
    formData.get("istSollMappingJson"),
    z.array(istSollMappingSchema).optional(),
    "IST/SOLL mapping",
  );
  const stakeholders = parseJsonFormValue(
    formData.get("stakeholdersJson"),
    z.array(stakeholderDefSchema),
    "Stakeholders",
  );
  const processFlow = parseJsonFormValue(
    formData.get("processFlowJson"),
    z.array(flowStepSchema).optional(),
    "Procesflow",
  );

  const jsonResults = [fields, istSollMapping, stakeholders, processFlow];
  const jsonIssues = jsonResults
    .filter((result): result is { ok: false; issue: string } => !result.ok)
    .map((result) => result.issue);
  if (jsonIssues.length > 0) return { issues: jsonIssues };

  const definition = editableChangeTypeDefinitionSchema.safeParse({
    name: parsedScalars.data.name,
    description: parsedScalars.data.description,
    extendedExplanation: parsedScalars.data.extendedExplanation,
    category: parsedScalars.data.category,
    fields: fields.ok ? fields.value : [],
    istSollMapping: istSollMapping.ok ? istSollMapping.value : undefined,
    cost: {
      baseCost: parsedScalars.data.baseCost,
      costCurrency: parsedScalars.data.costCurrency,
      perItemCost: parsedScalars.data.perItemCost,
      description: parsedScalars.data.costDescription,
    },
    defaultLeadDays: parsedScalars.data.defaultLeadDays,
    stakeholders: stakeholders.ok ? stakeholders.value : [],
    workflow: parsedScalars.data.workflow,
    processFlow: processFlow.ok ? processFlow.value : undefined,
    active: parsedScalars.data.active,
    sortOrder: parsedScalars.data.sortOrder,
  });
  if (!definition.success) {
    return { issues: definition.error.issues.map((issue) => issue.message) };
  }

  try {
    await updateChangeTypeDefinition({
      id: parsedScalars.data.id,
      slug: parsedScalars.data.slug,
      ...definition.data,
    });
  } catch (error) {
    return {
      issues: [
        error instanceof Error ? error.message : "Change type kon niet worden opgeslagen.",
      ],
    };
  }

  revalidateChangeTypeFrontend();
  revalidatePath(`/admin/change-types/${parsedScalars.data.id}`);
  return { message: "Change proces opgeslagen." };
}
