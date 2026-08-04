"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getWtpClassifications,
  createWtpClassification,
  updateWtpClassification,
  deleteWtpClassification,
} from "@/lib/db";
import {
  createClientConfigAssetClass,
  createClientConfigBenchmark,
  createClientConfigManager,
  createClientConfigNpcClassification,
  createClientConfigSubAssetClass,
  deleteClientConfigAssetClass,
  deleteClientConfigBenchmark,
  deleteClientConfigManager,
  deleteClientConfigNpcClassification,
  deleteClientConfigSubAssetClass,
  getClientConfigAssetClassAdminRows,
  getClientConfigBenchmarkAdminRows,
  getClientConfigManagerAdminRows,
  getClientConfigNpcClassificationAdminRows,
  getClientConfigSubAssetClassAdminRows,
  updateClientConfigAssetClass,
  updateClientConfigBenchmark,
  updateClientConfigManager,
  updateClientConfigNpcClassification,
  updateClientConfigSubAssetClass,
} from "@/lib/client-config-db";
import type {
  WtpClassification,
  ClientConfigAssetClassAdmin,
  ClientConfigBenchmarkAdmin,
  ClientConfigManagerAdmin,
  ClientConfigNpcClassificationAdmin,
  ClientConfigSubAssetClassAdmin,
} from "@/lib/types";
import { captureError } from "@/lib/sentry-helper";
import { requireAdmin } from "@/lib/admin-auth-request";

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
  clientConfigManagers: ClientConfigManagerAdmin[];
  clientConfigBenchmarks: ClientConfigBenchmarkAdmin[];
  clientConfigNpcClassifications: ClientConfigNpcClassificationAdmin[];
}> {
  const auth = await requireAdmin();
  if (!auth.authorized) throw new Error(auth.message);
  const [wtp, ccAssetClasses, ccSubAssetClasses, managers, benchmarks, npcClassifications] = await Promise.all([
    getWtpClassifications(),
    getClientConfigAssetClassAdminRows(),
    getClientConfigSubAssetClassAdminRows(),
    getClientConfigManagerAdminRows(),
    getClientConfigBenchmarkAdminRows(),
    getClientConfigNpcClassificationAdminRows(),
  ]);
  return {
    wtpClassifications: wtp,
    clientConfigAssetClasses: ccAssetClasses,
    clientConfigSubAssetClasses: ccSubAssetClasses,
    clientConfigManagers: managers,
    clientConfigBenchmarks: benchmarks,
    clientConfigNpcClassifications: npcClassifications,
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

const managerInputSchema = z.object({
  managerId: z.coerce.number().int().positive().optional(),
  managerCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3}$/, "Managercode moet precies 3 hoofdletters/cijfers zijn."),
  managerName: z.string().trim().min(2, "Naam moet minimaal 2 tekens bevatten.").max(50, "Naam mag maximaal 50 tekens bevatten."),
});

const benchmarkInputSchema = z.object({
  benchmarkId: z.coerce.number().int().positive().optional(),
  benchmarkCode: z.string().trim().toUpperCase().min(1, "Benchmarkcode is verplicht.").max(60, "Benchmarkcode mag maximaal 60 tekens bevatten."),
  benchmarkName: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? null : value,
    z.string().trim().max(100, "Naam mag maximaal 100 tekens bevatten.").nullable(),
  ),
  rimesCode: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? null : value,
    z.string().trim().toUpperCase().max(40, "Rimes code mag maximaal 40 tekens bevatten.").nullable(),
  ),
});

const npcClassificationInputSchema = z.object({
  npcClassificationId: z.coerce.number().int().positive().optional(),
  classificationName: z.string().trim().min(2, "Naam moet minimaal 2 tekens bevatten.").max(80, "Naam mag maximaal 80 tekens bevatten."),
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
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
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
      case "benchmark":
        return { ok: false, message: "Gebruik de client-config catalogussectie voor managers en benchmarks." };
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
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
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
      case "benchmark":
        return { ok: false, message: "Gebruik de client-config catalogussectie voor managers en benchmarks." };
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
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
  const type = formData.get("type") as AttributeType;
  const id = formData.get("id") as string;

  if (!type || !id) return { ok: false, message: "Type of ID ontbreekt." };

  try {
    switch (type) {
      case "wtp":
        await deleteWtpClassification(id);
        break;
      case "manager":
      case "benchmark":
        return { ok: false, message: "Gebruik de client-config catalogussectie voor managers en benchmarks." };
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
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
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
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
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
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
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
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
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
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
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
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
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

export async function createClientConfigManagerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
  const parsed = managerInputSchema.safeParse(parseFormData(formData));
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };

  try {
    await createClientConfigManager(parsed.data);
    revalidatePath("/admin/attribute-options");
    return { ok: true, message: `Manager "${parsed.data.managerName}" aangemaakt.` };
  } catch (error: any) {
    captureError(error, { endpoint: "createClientConfigManagerAction", phase: "server_action" });
    if (error.message?.includes("unique") || error.message?.includes("duplicate")) {
      return { ok: false, message: "Naam of shortcode bestaat al." };
    }
    return { ok: false, message: error.message || "Manager aanmaken mislukt." };
  }
}

export async function updateClientConfigManagerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
  const parsed = managerInputSchema.required({ managerId: true }).safeParse(parseFormData(formData));
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };

  try {
    await updateClientConfigManager(parsed.data);
    revalidatePath("/admin/attribute-options");
    return { ok: true, message: "Manager bijgewerkt." };
  } catch (error: any) {
    captureError(error, { endpoint: "updateClientConfigManagerAction", phase: "server_action" });
    if (error.message?.includes("unique") || error.message?.includes("duplicate")) {
      return { ok: false, message: "Naam of shortcode bestaat al." };
    }
    return { ok: false, message: error.message || "Manager bijwerken mislukt." };
  }
}

export async function deleteClientConfigManagerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
  const managerId = z.coerce.number().int().positive().safeParse(formData.get("managerId"));
  if (!managerId.success) return { ok: false, message: "Manager ID ontbreekt." };

  try {
    await deleteClientConfigManager(managerId.data);
    revalidatePath("/admin/attribute-options");
    return { ok: true, message: "Manager verwijderd." };
  } catch (error: any) {
    captureError(error, { endpoint: "deleteClientConfigManagerAction", phase: "server_action" });
    return { ok: false, message: error.message || "Manager verwijderen mislukt." };
  }
}

export async function createClientConfigBenchmarkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
  const parsed = benchmarkInputSchema.safeParse(parseFormData(formData));
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };

  try {
    await createClientConfigBenchmark(parsed.data);
    revalidatePath("/admin/attribute-options");
    return { ok: true, message: `Benchmark "${parsed.data.benchmarkCode}" aangemaakt.` };
  } catch (error: any) {
    captureError(error, { endpoint: "createClientConfigBenchmarkAction", phase: "server_action" });
    if (error.message?.includes("unique") || error.message?.includes("duplicate")) {
      return { ok: false, message: "Naam, shortcode of Rimes code bestaat al." };
    }
    return { ok: false, message: error.message || "Benchmark aanmaken mislukt." };
  }
}

export async function updateClientConfigBenchmarkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
  const parsed = benchmarkInputSchema.required({ benchmarkId: true }).safeParse(parseFormData(formData));
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };

  try {
    await updateClientConfigBenchmark(parsed.data);
    revalidatePath("/admin/attribute-options");
    return { ok: true, message: "Benchmark bijgewerkt." };
  } catch (error: any) {
    captureError(error, { endpoint: "updateClientConfigBenchmarkAction", phase: "server_action" });
    if (error.message?.includes("unique") || error.message?.includes("duplicate")) {
      return { ok: false, message: "Naam, shortcode of Rimes code bestaat al." };
    }
    return { ok: false, message: error.message || "Benchmark bijwerken mislukt." };
  }
}

export async function deleteClientConfigBenchmarkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
  const benchmarkId = z.coerce.number().int().positive().safeParse(formData.get("benchmarkId"));
  if (!benchmarkId.success) return { ok: false, message: "Benchmark ID ontbreekt." };

  try {
    await deleteClientConfigBenchmark(benchmarkId.data);
    revalidatePath("/admin/attribute-options");
    return { ok: true, message: "Benchmark verwijderd." };
  } catch (error: any) {
    captureError(error, { endpoint: "deleteClientConfigBenchmarkAction", phase: "server_action" });
    return { ok: false, message: error.message || "Benchmark verwijderen mislukt." };
  }
}

export async function createClientConfigNpcClassificationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
  const parsed = npcClassificationInputSchema.safeParse(parseFormData(formData));
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };

  try {
    await createClientConfigNpcClassification(parsed.data);
    revalidatePath("/admin/attribute-options");
    return { ok: true, message: `NPC classificatie "${parsed.data.classificationName}" aangemaakt.` };
  } catch (error: any) {
    captureError(error, { endpoint: "createClientConfigNpcClassificationAction", phase: "server_action" });
    if (error.message?.includes("unique") || error.message?.includes("duplicate")) {
      return { ok: false, message: "Naam bestaat al." };
    }
    return { ok: false, message: error.message || "NPC classificatie aanmaken mislukt." };
  }
}

export async function updateClientConfigNpcClassificationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
  const parsed = npcClassificationInputSchema.required({ npcClassificationId: true }).safeParse(parseFormData(formData));
  if (!parsed.success) return { ok: false, message: formatZodError(parsed.error) };

  try {
    await updateClientConfigNpcClassification(parsed.data);
    revalidatePath("/admin/attribute-options");
    return { ok: true, message: "NPC classificatie bijgewerkt." };
  } catch (error: any) {
    captureError(error, { endpoint: "updateClientConfigNpcClassificationAction", phase: "server_action" });
    if (error.message?.includes("unique") || error.message?.includes("duplicate")) {
      return { ok: false, message: "Naam bestaat al." };
    }
    return { ok: false, message: error.message || "NPC classificatie bijwerken mislukt." };
  }
}

export async function deleteClientConfigNpcClassificationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdmin();
  if (!auth.authorized) return { ok: false, message: auth.message };
  const npcClassificationId = z.coerce.number().int().positive().safeParse(formData.get("npcClassificationId"));
  if (!npcClassificationId.success) return { ok: false, message: "NPC classificatie ID ontbreekt." };

  try {
    await deleteClientConfigNpcClassification(npcClassificationId.data);
    revalidatePath("/admin/attribute-options");
    return { ok: true, message: "NPC classificatie verwijderd." };
  } catch (error: any) {
    captureError(error, { endpoint: "deleteClientConfigNpcClassificationAction", phase: "server_action" });
    return { ok: false, message: error.message || "NPC classificatie verwijderen mislukt." };
  }
}
