"use server";

import { z } from "zod";
import { updateClientAssetClass } from "@/lib/db";
import { ASSET_CLASSES } from "@/lib/types";

export type UpdateAssetClassState = {
  success?: boolean;
  error?: string;
};

/**
 * Server action to update the asset_class of an existing client.
 * Called from the inline dropdown in the client config table.
 */
export async function updateClientAssetClassAction(
  _prev: UpdateAssetClassState,
  formData: FormData,
): Promise<UpdateAssetClassState> {
  const input = z.object({
    external_reference: z.string().min(1, "Client reference is required."),
    asset_class: z.enum(ASSET_CLASSES, {
      message: "Kies een geldige asset class.",
    }),
  }).safeParse(Object.fromEntries(formData));

  if (!input.success) {
    return {
      success: false,
      error: input.error.issues.map((i) => i.message).join(", "),
    };
  }

  try {
    await updateClientAssetClass(
      input.data.external_reference,
      input.data.asset_class,
    );
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Asset class kon niet worden opgeslagen.";
    return { success: false, error: message };
  }
}
