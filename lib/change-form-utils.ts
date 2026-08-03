/**
 * Generic change form utilities.
 *
 * Pure functions for field validation, cost computation, and
 * SLA/lead-time estimation — used by the generic change form
 * component and server actions.
 */
import type { ChangeTypeConfig } from "@/lib/types";

export type ValidationResult = { valid: boolean; errors: Record<string, string> };

/**
 * Validate field values against a ChangeTypeConfig's field definitions.
 *
 * Handles all ChangeFieldType variants and applies constraints
 * (required, min/max, minLength/maxLength, option validation).
 */
export function validateGenericFields(
  config: Pick<ChangeTypeConfig, "fields">,
  values: Record<string, unknown>,
): ValidationResult {
  const errors: Record<string, string> = {};

  for (const field of config.fields) {
    const value = values[field.key];

    if (field.required && (value === undefined || value === null || value === "")) {
      errors[field.key] = `${field.label} is verplicht.`;
      continue;
    }

    if (value === undefined || value === null || value === "") continue;

    // Type-specific validation
    switch (field.type) {
      case "number":
      case "currency": {
        const num = typeof value === "number" ? value : Number(value);
        if (isNaN(num)) {
          errors[field.key] = `${field.label} moet een getal zijn.`;
        } else {
          if (field.min !== undefined && num < field.min) {
            errors[field.key] = `${field.label} mag niet lager zijn dan ${field.min}.`;
          }
          if (field.max !== undefined && num > field.max) {
            errors[field.key] = `${field.label} mag niet hoger zijn dan ${field.max}.`;
          }
        }
        break;
      }
      case "text":
      case "longtext": {
        const str = String(value);
        if (field.minLength !== undefined && str.length < field.minLength) {
          errors[field.key] = `${field.label} moet minimaal ${field.minLength} tekens bevatten.`;
        }
        if (field.maxLength !== undefined && str.length > field.maxLength) {
          errors[field.key] = `${field.label} mag maximaal ${field.maxLength} tekens bevatten.`;
        }
        break;
      }
      case "date": {
        const dateStr = String(value);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          errors[field.key] = `${field.label} is geen geldige datum (YYYY-MM-DD).`;
        }
        break;
      }
      case "select": {
        const str = String(value);
        const validValues = (field.options ?? []).map((o) => o.value);
        if (validValues.length > 0 && !validValues.includes(str)) {
          errors[field.key] = `${field.label} heeft een ongeldige waarde.`;
        }
        break;
      }
      case "multiselect": {
        const items = Array.isArray(value) ? value : [value];
        const validValues = (field.options ?? []).map((o) => o.value);
        if (validValues.length > 0) {
          const invalid = items.filter((v) => !validValues.includes(String(v)));
          if (invalid.length > 0) {
            errors[field.key] = `${field.label} bevat ongeldige waarden.`;
          }
        }
        break;
      }
      case "boolean": {
        // Boolean fields that are required are checked above; no additional validation needed
        break;
      }
      case "benchmark": {
        // Benchmark references are validated at the action level (DB lookup)
        break;
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Compute the estimated cost for a change request based on
 * the config's cost model and the number of items involved.
 */
export function computeEstimatedCost(
  config: Pick<ChangeTypeConfig, "cost">,
  itemCount: number,
): { cost: number; currency: string; description: string } {
  return {
    cost: config.cost.baseCost + (config.cost.perItemCost ?? 0) * Math.max(0, itemCount),
    currency: config.cost.costCurrency,
    description: config.cost.description,
  };
}

/**
 * Compute the SLA end date (lead time) as an ISO date string.
 */
export function computeSlaEndDate(
  config: Pick<ChangeTypeConfig, "defaultLeadDays">,
  startDate: string | Date = new Date(),
): string {
  const start = typeof startDate === "string" ? new Date(startDate) : startDate;
  const end = new Date(start);
  end.setDate(end.getDate() + config.defaultLeadDays);
  return end.toISOString().split("T")[0];
}

/**
 * Type-specific prefix map for change request references.
 */
const REFERENCE_PREFIX: Record<string, string> = {
  benchmark_switch: "BS",
  new_benchmark: "NB",
  new_asset_class: "AC",
  new_sub_asset_class: "SA",
  fee_change: "FC",
  mandate_change: "MC",
  custodian_change: "CC",
  rebalance_trigger: "RT",
  customer_onboarding: "NC",
  portfolio_addition: "NP",
  // Client-config lifecycle types (explicit taxonomy replacing portfolio_addition)
  client_onboarding: "CO",
  portfolio_configuration_create: "NP",
  portfolio_configuration_update: "PU",
  portfolio_configuration_retire: "PR",
};

/**
 * Generate a human-readable change request reference.
 *
 * Pattern: BCM-{year}-{typePrefix}-{timestamp}
 * Falls back to "CR" for unknown types.
 *
 * The suffix is the last 6 digits of the epoch-ms timestamp. Two submissions
 * in the same millisecond would previously produce the identical reference and
 * violate the unique change_requests_reference_key constraint (observed in the
 * parallel @db e2e run — both tests submit within the same ms). A per-process
 * monotonic counter keeps same-ms calls distinct while preserving the
 * human-readable 6-digit format. Note: the counter is process-local; the
 * change_request reference key is still the ultimate authority across
 * processes, so callers that hit a unique violation should regenerate and
 * retry once.
 */
let lastReferenceMs = 0;
let sameMsReferenceCounter = 0;

export function generateReference(changeTypeSlug: string): string {
  const year = new Date().getFullYear();
  const now = Date.now();
  if (now === lastReferenceMs) {
    sameMsReferenceCounter += 1;
  } else {
    lastReferenceMs = now;
    sameMsReferenceCounter = 0;
  }
  // now + counter keeps the same 6 digits for up to 999,999 same-ms calls
  // (the counter never grows that large in one ms) and makes each call within
  // the same ms produce a distinct suffix.
  const suffix = String(now + sameMsReferenceCounter).slice(-6);
  const prefix = REFERENCE_PREFIX[changeTypeSlug] ?? "CR";
  return `BCM-${year}-${prefix}-${suffix}`;
}

/**
 * Get today's date as YYYY-MM-DD string in the server's local timezone.
 */
export function getTodayDateString(): string {
  return new Date().toLocaleDateString("en-CA");
}

/**
 * Compute the minimum acceptable effective date as a YYYY-MM-DD string.
 *
 * The minimum date is today + leadDays in the server's local timezone.
 */
export function getMinimumDate(leadDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + leadDays);
  return d.toLocaleDateString("en-CA");
}

/**
 * Validate an effective date against a lead time.
 *
 * Rules:
 * 1. If the date is in the past, return an error message containing "ingangsdatum".
 * 2. If the date is before today + leadDays, return an error message containing "doorlooptijd".
 * 3. Otherwise return null (valid).
 */
export function validateEffectiveDate(
  dateStr: string,
  leadDays: number,
): string | null {
  const today = getTodayDateString();

  // Past dates are always invalid
  if (dateStr < today) {
    return "De gewenste ingangsdatum ligt in het verleden.";
  }

  // Dates before the minimum lead time are invalid
  const minDate = getMinimumDate(leadDays);
  if (dateStr < minDate) {
    return `De gewenste ingangsdatum valt binnen de doorlooptijd van ${leadDays} dagen.`;
  }

  return null;
}

/**
 * Build field values from FormData, applying defaults from the config.
 */
export function buildFieldValuesFromFormData(
  config: Pick<ChangeTypeConfig, "fields">,
  formData: FormData,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const field of config.fields) {
    const raw = formData.get(field.key);
    if (raw !== null && raw !== "") {
      switch (field.type) {
        case "number":
        case "currency":
          values[field.key] = Number(raw);
          break;
        case "boolean":
          values[field.key] = raw === "true" || raw === "on";
          break;
        default:
          values[field.key] = String(raw);
      }
    } else if (field.defaultValue !== undefined) {
      values[field.key] = field.defaultValue;
    }
  }

  return values;
}
