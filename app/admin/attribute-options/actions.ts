"use server";

import { revalidatePath } from "next/cache";
import {
  getWtpClassifications,
  getAssetClassRows,
  getManagers,
  getBenchmarkGroups,
  createWtpClassification,
  createAssetClassRow,
  createManager,
  createBenchmarkGroup,
  updateWtpClassification,
  updateAssetClassRow,
  updateManager,
  updateBenchmarkGroup,
  deleteWtpClassification,
  deleteAssetClassRow,
  deleteManager,
  deleteBenchmarkGroup,
} from "@/lib/db";
import type { WtpClassification, AssetClassRow, Manager, BenchmarkGroup } from "@/lib/types";

export type AttributeType = "wtp" | "asset_class" | "manager" | "benchmark";

export type ActionState = {
  ok: boolean;
  message: string;
} | null;

// ── Loaders ──

export async function loadAttributeOptions(): Promise<{
  wtpClassifications: WtpClassification[];
  assetClassRows: AssetClassRow[];
  managers: Manager[];
  benchmarkGroups: BenchmarkGroup[];
}> {
  const [wtp, ac, mgr, bg] = await Promise.all([
    getWtpClassifications(),
    getAssetClassRows(),
    getManagers(),
    getBenchmarkGroups(),
  ]);
  return { wtpClassifications: wtp, assetClassRows: ac, managers: mgr, benchmarkGroups: bg };
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
    case "asset_class": return "Asset class";
    case "manager": return "Manager";
    case "benchmark": return "Benchmark";
  }
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
      case "asset_class":
        await createAssetClassRow(name.trim());
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
      case "asset_class":
        await updateAssetClassRow(id, name.trim());
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
      case "asset_class":
        await deleteAssetClassRow(id);
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
    return { ok: false, message: e.message || "Verwijderen mislukt." };
  }
}
