"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updateChangeTypeActive, updateChangeTypeConfig } from "@/lib/db";

export type ChangeTypeAdminState = {
  message?: string;
  issues?: string[];
};

const changeTypeAdminSchema = z.object({
  id: z.string().uuid("Change type ontbreekt."),
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
  id: z.string().uuid("Change type ontbreekt."),
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
});

function revalidateChangeTypeFrontend() {
  revalidatePath("/admin/change-types");
  revalidatePath("/change-catalog");
  revalidatePath("/changes/new");
}

export async function updateChangeTypeAdmin(
  _: ChangeTypeAdminState,
  formData: FormData,
): Promise<ChangeTypeAdminState> {
  const rawInput = Object.fromEntries(formData);
  rawInput.active = formData.getAll("active").includes("true") ? "true" : "false";

  const parsed = changeTypeAdminSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { issues: parsed.error.issues.map((issue) => issue.message) };
  }

  try {
    await updateChangeTypeConfig({
      id: parsed.data.id,
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
  const parsed = changeTypeActiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { issues: parsed.error.issues.map((issue) => issue.message) };
  }

  try {
    await updateChangeTypeActive({
      id: parsed.data.id,
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
