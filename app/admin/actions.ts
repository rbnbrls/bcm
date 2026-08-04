"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth-request";
import { resetSeedData } from "@/lib/seed-reset";
import { captureError } from "@/lib/sentry-helper";

export type ResetSeedDataState = {
  success: boolean;
  message: string;
  details?: string;
};

export async function resetSeedDataAction(
  _prev: ResetSeedDataState,
  formData: FormData,
): Promise<ResetSeedDataState> {
  const auth = await requireAdmin();
  if (!auth.authorized) {
    return { success: false, message: auth.message };
  }

  const confirmation = String(formData.get("confirmation") ?? "").trim().toUpperCase();
  if (confirmation !== "RESET") {
    return {
      success: false,
      message: "Typ RESET om te bevestigen dat de seed data opnieuw opgebouwd mag worden.",
    };
  }

  try {
    const result = await resetSeedData();
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/client-config");
    revalidatePath("/admin/attribute-options");
    revalidatePath("/benchmarks");
    revalidatePath("/changes");
    revalidatePath("/changes/new");
    return {
      success: true,
      message: "Seed data is teruggezet naar de standaardwaarden.",
      details: `${result.truncatedTables.length} tabellen opgeschoond; client_config seed opnieuw geladen.`,
    };
  } catch (error) {
    captureError(error, { action: "reset-seed-data" });
    const message = error instanceof Error ? error.message : "Reset seed data is mislukt.";
    return { success: false, message };
  }
}
