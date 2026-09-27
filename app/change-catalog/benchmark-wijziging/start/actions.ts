"use server";

import { z } from "zod";
import { getIdentityContext } from "@/lib/identity/request";
import { authorizeWorkflowPermission } from "@/lib/workflow-studio-authorization";
import { sql } from "@/lib/db";
import { getFeatureFlagSnapshot } from "@/lib/feature-flags";

const BenchmarkChangeRequestSchema = z.object({
  clientCode: z.string().trim().regex(/^[A-Z0-9]{1,3}$/, "Selecteer een bestaande klant."),
  primaryAccountId: z.string().trim().min(3, "Selecteer een bestaande portefeuille."),
  requestedBenchmarkCode: z.string().trim().min(1, "Selecteer een bestaande SOLL-benchmark."),
  requestedBy: z.string().trim().min(2, "Vul de naam van de aanvrager in."),
  rationale: z.string().trim().min(10, "Licht de reden van de wijziging in minimaal 10 tekens toe."),
  effectiveDate: z.string().date("Kies een geldige ingangsdatum."),
});

export type BenchmarkChangeFormState = {
  success: boolean;
  message: string;
  instanceId?: string;
  fieldErrors?: Record<string, string>;
};

export async function startBenchmarkChange(
  _: BenchmarkChangeFormState,
  formData: FormData
): Promise<BenchmarkChangeFormState> {
  const flags = getFeatureFlagSnapshot();
  if (!flags["workflow_runtime.start"]) {
    return {
      success: false,
      message: "Workflow runtime is nog niet ingeschakeld. Neem contact op met de beheerder.",
      fieldErrors: undefined,
    };
  }
  if (!sql) {
    return {
      success: false,
      message: "De database is niet beschikbaar.",
      fieldErrors: undefined,
    };
  }

  const identity = await getIdentityContext();
  const permission = authorizeWorkflowPermission(identity, "workflow:start");
  if (!permission.authorized) {
    return {
      success: false,
      message: permission.message,
      fieldErrors: undefined,
    };
  }

  const body = Object.fromEntries(formData);
  const validation = BenchmarkChangeRequestSchema.safeParse(body);
  if (!validation.success) {
    return {
      success: false,
      message: "Validatiefout",
      fieldErrors: Object.fromEntries(
        validation.error.issues
          .filter((issue) => issue.path.length > 0)
          .map((issue) => [issue.path[0] as string, issue.message])
      ),
    };
  }

  try {
    const response = await fetch(`/api/workflows/benchmark-change`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validation.data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        message: errorData.error || "Onbekende fout bij het starten van de workflow",
        fieldErrors: undefined,
      };
    }

    const data = await response.json();
    return {
      success: true,
      message: data.message,
      instanceId: data.instanceId,
      fieldErrors: undefined,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Onverwachte fout",
      fieldErrors: undefined,
    };
  }
}
