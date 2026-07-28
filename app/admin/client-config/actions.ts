"use server";

import { z } from "zod";
import { updateClientAssetClass, updatePortfolioAttribute, updatePortfolioAssetClassFields, getPortfolioById } from "@/lib/db";
import { ASSET_CLASSES } from "@/lib/types";
import { validatePortfolioFields } from "@/lib/portfolio-validation";
import { captureError } from "@/lib/sentry-helper";

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
    captureError(error, { endpoint: "updateClientAssetClassAction", phase: "server_action" });
    const message =
      error instanceof Error
        ? error.message
        : "Asset class kon niet worden opgeslagen.";
    return { success: false, error: message };
  }
}

export type UpdatePortfolioAttributeState = {
  success?: boolean;
  error?: string;
};

/**
 * Server action to update a portfolio attribute FK column.
 * Called from inline dropdowns in the client config table.
 * column must be one of: wtp_classification_id, asset_class_id, manager_id, benchmark_id
 */
export async function updatePortfolioAttributeAction(
  _prev: UpdatePortfolioAttributeState,
  formData: FormData,
): Promise<UpdatePortfolioAttributeState> {
  const input = z.object({
    portfolio_id: z.string().uuid("Ongeldig portfolio ID."),
    column: z.enum(
      ["wtp_classification_id", "asset_class_id", "manager_id", "benchmark_id"],
      { message: "Ongeldige kolom." }
    ),
    value_id: z.string().uuid("Ongeldige waarde."),
  }).safeParse(Object.fromEntries(formData));

  if (!input.success) {
    return {
      success: false,
      error: input.error.issues.map((i) => i.message).join(", "),
    };
  }

  try {
    await updatePortfolioAttribute(
      input.data.portfolio_id,
      input.data.column,
      input.data.value_id,
    );
    return { success: true };
  } catch (error) {
    captureError(error, { endpoint: "updatePortfolioAttributeAction", phase: "server_action" });
    const message =
      error instanceof Error
        ? error.message
        : "Waarde kon niet worden opgeslagen.";
    return { success: false, error: message };
  }
}

export type UpdatePortfolioAssetClassFieldsState = {
  success?: boolean;
  error?: string;
};

/**
 * Server action to update a portfolio's assetClass and/or subAssetClass.
 * Both fields are optional — only provided fields are validated and saved.
 *
 * - If assetClass is provided alone: validates the key, fetches current
 *   subAssetClass from DB to check the pair, clears subAssetClass if invalid.
 * - If subAssetClass is provided alone: fetches current assetClass from DB
 *   and validates the pair.
 * - If both are provided: validates the pair directly.
 * Called from inline editing in the client config table.
 */
export async function updatePortfolioAssetClassFieldsAction(
  _prev: UpdatePortfolioAssetClassFieldsState,
  formData: FormData,
): Promise<UpdatePortfolioAssetClassFieldsState> {
  const input = z.object({
    portfolio_id: z.string().uuid("Ongeldig portfolio ID."),
    asset_class: z.string().optional(),
    sub_asset_class: z.string().optional(),
  }).safeParse(Object.fromEntries(formData));

  if (!input.success) {
    return {
      success: false,
      error: input.error.issues.map((i) => i.message).join(", "),
    };
  }

  const { portfolio_id, asset_class, sub_asset_class } = input.data;

  // Determine what to validate based on what was provided
  const updatingAssetClass = asset_class !== undefined;
  const updatingSubAssetClass = sub_asset_class !== undefined;

  if (!updatingAssetClass && !updatingSubAssetClass) {
    return { success: false, error: "Geen wijzigingen aangeleverd." };
  }

  try {
    // Fetch current portfolio to check existing values
    const existingPortfolio = await getPortfolioById(portfolio_id);
    if (!existingPortfolio) {
      return { success: false, error: "Portfolio niet gevonden." };
    }

    const currentAssetClass = updatingAssetClass ? asset_class!.trim() : existingPortfolio.assetClass;
    const currentSubAssetClass = updatingSubAssetClass ? sub_asset_class!.trim() : existingPortfolio.subAssetClass;

    if (updatingAssetClass) {
      // Validate the new assetClass key
      const acErrors = validatePortfolioFields({ assetClass: currentAssetClass });
      if (acErrors.length > 0) {
        return { success: false, error: acErrors.join(" ") };
      }

      // If changing assetClass, check whether current subAssetClass is still valid
      if (currentSubAssetClass) {
        const subErrors = validatePortfolioFields({
          assetClass: currentAssetClass,
          subAssetClass: currentSubAssetClass,
        });
        if (subErrors.length > 0) {
          // SubAssetClass is invalid for the new assetClass — clear it
          await updatePortfolioAssetClassFields(portfolio_id, {
            assetClass: currentAssetClass,
            subAssetClass: "",
          });
          return { success: true };
        }
      }
    }

    if (updatingSubAssetClass) {
      // Validate subAssetClass requires a valid assetClass
      const errors = validatePortfolioFields({
        assetClass: currentAssetClass,
        subAssetClass: currentSubAssetClass,
      });
      if (errors.length > 0) {
        return { success: false, error: errors.join(" ") };
      }
    }

    // Save the updates
    const dbFields: { assetClass?: string; subAssetClass?: string } = {};
    if (updatingAssetClass) dbFields.assetClass = currentAssetClass;
    if (updatingSubAssetClass) dbFields.subAssetClass = currentSubAssetClass;

    await updatePortfolioAssetClassFields(portfolio_id, dbFields);
    return { success: true };
  } catch (error) {
    captureError(error, { endpoint: "updatePortfolioAssetClassFieldsAction", phase: "server_action" });
    const message =
      error instanceof Error
        ? error.message
        : "Asset class velden konden niet worden opgeslagen.";
    return { success: false, error: message };
  }
}
