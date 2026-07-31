"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getWtpClassifications,
  getManagers,
  getBenchmarkGroups,
  createWtpClassification,
  createManager,
  createBenchmarkGroup,
  updateWtpClassification,
  updateManager,
  updateBenchmarkGroup,
  deleteWtpClassification,
  deleteManager,
  deleteBenchmarkGroup,
} from "@/lib/db";
import {
  createClientConfigAssetClass,
  createClientConfigSubAssetClass,
  deleteClientConfigAssetClass,
  deleteClientConfigSubAssetClass,
  getClientConfigAssetClassAdminRows,
  getClientConfigSubAssetClassAdminRows,
  updateClientConfigAssetClass,
  updateClientConfigSubAssetClass,
} from "@/lib/client-config-db";
import type {
  WtpClassification,
  Manager,
  BenchmarkGroup,
  ClientConfigAssetClassAdmin,
  ClientConfigSubAssetClassAdmin,
} from "@/lib/types";
import { captureError } from "@/lib/sentry-helper";

export type AttributeType = "wtp" | "manager" | "benchmark";

export type ActionState = {
  ok: boolean;
  message: string;
} | null;

// ── Loaders ──

export async function loadAttributeOptions(): Promise<{
  wtpClassifications: WtpClassification[];
  clientConfigAssetClasses: ClientConfigAssetClassAdmin[];
  clientConfigSubAssetClasses: ClientConfigSubAssetClassAdmin[];
  managers: Manager[];
  benchmarkGroups: BenchmarkGroup[];
}> {
  const [wtp, ccAssetClasses, ccSubAssetClasses, mgr, bg] = await Promise.all([
    getWtpClassifications(),
    getClientConfigAssetClassAdminRows(),
    getClientConfigSubAssetClassAdminRows(),
    getManagers(),
    getBenchmarkGroups(),
  ]);
  return {
    wtpClassifications: wtp,
    clientConfigAssetClasses: ccAssetClasses,
    clientConfigSubAssetClasses: ccSubAssetClasses,
    managers: mgr,
    benchmarkGroups: bg,
  };
}

// ── Validation ──

function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Naam is verplicht.";
  if (trimmed.length < 2) return "Naam moet minimaal 2 tekens bevatten.";
  if (trimmed.length > 100) return "Naam mag maximaal 100 tekens bevatten.";
  return null;
}

function getAttributeLabel(type: AttributeType): string {
  switch (type) {
    case "wtp": return "WTP classificatie";
    case "manager": return "Manager";
    case "benchmark": return "Benchmark";
  }
}

const assetClassInputSchema = z.object({
  assetClassId: z.coerce.number().int().positive().optional(),
  assetClassCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Asset class shortcode moet precies 2 hoofdletters zijn."),
  assetClassName: z.string().trim().min(2, "Naam moet minimaal 2 tekens bevatten.").max(30, "Naam mag maximaal 30 tekens bevatten."),
});

const subAssetClassInputSchema = z.object({
  subAssetClassId: z.coerce.number().int().positive().optional(),
  assetClassId: z.coerce.number().int().positive("Asset class is verplicht."),
  subAssetClassCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Sub asset class shortcode moet precies 3 hoofdletters zijn."),
  subAssetClassName: z.string().trim().min(2, "Naam moet minimaal 2 tekens bevatten.").max(100, "Naam mag maximaal 100 tekens bevatten."),
  sortOrder: z.preprocess(
    (value) => value === "" || value == null ? null : value,
    z.coerce.number().int().positive().nullable(),
  ),
});

function parseFormData(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData.entries());
}

function formatZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Ongeldige invoer.";
}

// ── Server actions ──

export async function createOption(
  prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const type = formData.get("type") as AttributeType;
  const name = formData.get("name") as string;

  if (!type) return { ok: false, message: "Type ontbreekt." };
  const nameError = validateName(name);
  if (nameError) return { ok: false, message: nameError };

  try {
    switch (type) {
      case "wtp":
        await createWtpClassification(name.trim());
        break;
      case "manager":
        await createManager(name.trim());
        break;
      case "benchmark":
        await createBenchmarkGroup(name.trim());
        break;
    }
    revalidatePath("/admin/attribute-options");
    return { ok: true, message: `${getAttributeLabel(type)} "${name.trim()}" aangemaakt.` };
  } catch (e: any) {
    captureError(e, { endpoint: "createOption", phase: "server_action" });
    if (e.message?.includes("unique") || e.message?.includes("duplicate")) {
      return { ok: false, message: `"${name.trim()}" bestaat al.` };
    }
    return { ok: false, message: e.message || "Aanmaken mislukt." };
  }
}

export async function updateOption(
  prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const type = formData.get("type") as AttributeType;
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;

  if (!type || !id) return { ok: false, message: "Type of ID ontbreekt." };
  const nameError = validateName(name);
  if (nameError) return { ok: false, message: nameError };

  try {
    switch (type) {
      case "wtp":
        await updateWtpClassification(id, name.trim());
        break;
      case "manager":
        await updateManager(id, name.trim());
        break;
      case "benchmark":
        await updateBenchmarkGroup(id, name.trim());
        break;
    }
    revalidatePath("/admin/attribute-options");
    return { ok: true, message: `${getAttributeLabel(type)} bijgewerkt.` };
  } catch (e: any) {
    captureError(e, { endpoint: "updateOption", phase: "server_action" });
    if (e.message?.includes("unique") || e.message?.includes("duplicate")) {
      return { ok: false, message: `"${name.trim()}" bestaat al.` };
    }
    return { ok: false, message: e.message || "Bijwerken mislukt." };
  }
}

export async function deleteOption(
  prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const type = formData.get("type") as AttributeType;
  const id = formData.get("id") as string;

  if (!type || !id) return { ok: false, message: "Type of ID ontbreekt." };

  try {
    switch (type) {
      case "wtp":
        await deleteWtpClassification(id);
        break;
      case "manager":
        await deleteManager(id);
        break;
      case "benchmark":
        await deleteBenchmarkGroup(id);
        break;
    }
    revalidatePath("/admin/attribute-options");
    return { ok: true, message: `${getAttributeLabel(type)} verwijderd.` };
  } catch (e: any) {
    captureError(e, { endpoint: "deleteOption", phase: "server_action" });
    return { ok: false, message: e.message || "Verwijderen mislukt." };
  }
}

export async function createClientConfigAssetClassAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = assetClassInputSchema.safeParse(parseFormData(formData));
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };

  try {
    await createClientConfigAssetClass(parsed.data);
    revalidatePath("/admin/attribute-options");
    return { ok: true, message: `Asset class "${parsed.data.assetClassName}" aangemaakt.` };
  } catch (error: any) {
    captureError(error, { endpoint: "createClientConfigAssetClassAction", phase: "server_action" });
    if (error.message?.includes("unique") || error.message?.includes("duplicate")) {
      return { ok: false, message: "Naam of shortcode bestaat al." };
    }
    return { ok: false, message: error.message || "Asset class aanmaken mislukt." };
  }
}

export async function updateClientConfigAssetClassAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = assetClassInputSchema.required({ assetClassId: true }).safeParse(parseFormData(formData));
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };

  try {
    await updateClientConfigAssetClass(parsed.data);
    revalidatePath("/admin/attribute-options");
    return { ok: true, message: "Asset class bijgewerkt." };
  } catch (error: any) {
    captureError(error, { endpoint: "updateClientConfigAssetClassAction", phase: "server_action" });
    if (error.message?.includes("unique") || error.message?.includes("duplicate")) {
      return { ok: false, message: "Naam of shortcode bestaat al." };
    }
    return { ok: false, message: error.message || "Asset class bijwerken mislukt." };
  }
}

export async function deleteClientConfigAssetClassAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const assetClassId = z.coerce.number().int().positive().safeParse(formData.get("assetClassId"));
  if (!assetClassId.success) return { ok: false, message: "Asset class ID ontbreekt." };

  try {
    await deleteClientConfigAssetClass(assetClassId.data);
    revalidatePath("/admin/attribute-options");
    return { ok: true, message: "Asset class verwijderd." };
  } catch (error: any) {
    captureError(error, { endpoint: "deleteClientConfigAssetClassAction", phase: "server_action" });
    return { ok: false, message: error.message || "Asset class verwijderen mislukt." };
  }
}

export async function createClientConfigSubAssetClassAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = subAssetClassInputSchema.safeParse(parseFormData(formData));
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };

  try {
    await createClientConfigSubAssetClass(parsed.data);
    revalidatePath("/admin/attribute-options");
    return { ok: true, message: `Sub asset class "${parsed.data.subAssetClassName}" aangemaakt.` };
  } catch (error: any) {
    captureError(error, { endpoint: "createClientConfigSubAssetClassAction", phase: "server_action" });
    if (error.message?.includes("unique") || error.message?.includes("duplicate")) {
      return { ok: false, message: "Naam of shortcode bestaat al voor deze asset class." };
    }
    return { ok: false, message: error.message || "Sub asset class aanmaken mislukt." };
  }
}

export async function updateClientConfigSubAssetClassAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = subAssetClassInputSchema.required({ subAssetClassId: true }).safeParse(parseFormData(formData));
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };

  try {
    await updateClientConfigSubAssetClass(parsed.data);
    revalidatePath("/admin/attribute-options");
    return { ok: true, message: "Sub asset class bijgewerkt." };
  } catch (error: any) {
    captureError(error, { endpoint: "updateClientConfigSubAssetClassAction", phase: "server_action" });
    if (error.message?.includes("unique") || error.message?.includes("duplicate")) {
      return { ok: false, message: "Naam of shortcode bestaat al voor deze asset class." };
    }
    return { ok: false, message: error.message || "Sub asset class bijwerken mislukt." };
  }
}

export async function deleteClientConfigSubAssetClassAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const subAssetClassId = z.coerce.number().int().positive().safeParse(formData.get("subAssetClassId"));
  if (!subAssetClassId.success) return { ok: false, message: "Sub asset class ID ontbreekt." };

  try {
    await deleteClientConfigSubAssetClass(subAssetClassId.data);
    revalidatePath("/admin/attribute-options");
    return { ok: true, message: "Sub asset class verwijderd." };
  } catch (error: any) {
    captureError(error, { endpoint: "deleteClientConfigSubAssetClassAction", phase: "server_action" });
    return { ok: false, message: error.message || "Sub asset class verwijderen mislukt." };
  }
}
