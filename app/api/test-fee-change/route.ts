/**
 * Test endpoint for creating a fee_change change request.
 *
 * This is a temporary endpoint used during validation of the generic
 * change-type model to create a change request of the third type
 * (fee_change) programmatically, since there is no dedicated form yet.
 *
 * DELETE this file after production rollout.
 */
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getChangeTypeBySlug, saveChangeRequest } from "@/lib/db";
import { captureError } from "@/lib/sentry-helper";

export async function POST() {
  try {
    const changeTypeConfig = await getChangeTypeBySlug("fee_change");
    if (!changeTypeConfig) {
      return NextResponse.json(
        { error: "fee_change change type not found in config" },
        { status: 404 },
      );
    }

    const id = randomUUID();
    const reference = `BCM-${new Date().getFullYear()}-FC-${String(Date.now()).slice(-6)}`;

    await saveChangeRequest({
      id,
      reference,
      changeType: "fee_change",
      changeTypeId: changeTypeConfig.id,
      clientId: "9f9280fc-9572-49d1-b81c-2a039652bc93",
      requestedBy: "Validatietest (generic model)",
      rationale:
        "Test change request voor fee_change type — validatie generic change-type model",
      effectiveDate: new Date().toISOString().split("T")[0],
      items: [],
      fields: [
        {
          fieldKey: "portfolio_id",
          istValue: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
          sollValue: "c4707067-b98a-4a0f-92c7-5ee510dc70ff",
        },
        { fieldKey: "current_fee", istValue: 0.45, sollValue: 0.5 },
        { fieldKey: "requested_fee", istValue: 0.45, sollValue: 0.5 },
        {
          fieldKey: "effective_date",
          istValue: null,
          sollValue: new Date(Date.now() + 90 * 86400000)
            .toISOString()
            .split("T")[0],
        },
      ],
      estimatedCost: changeTypeConfig.cost.baseCost,
      estimatedCostCurrency: "EUR",
      estimatedLeadDays: changeTypeConfig.defaultLeadDays,
      stakeholderAssignments: [
        {
          stakeholderId: "internal_admin",
          contact: "admin@bcm.example.com",
          notifiedAt: null,
        },
        {
          stakeholderId: "asset_service_provider",
          contact: "asp@bcm.example.com",
          notifiedAt: null,
        },
      ],
    });

    return NextResponse.json({
      status: "ok",
      message: `Fee change request ${reference} created successfully`,
      reference,
      id,
      detailUrl: `/changes/${id}`,
    });
  } catch (error) {
    captureError(error, { route: "/api/test-fee-change", method: "POST", phase: "request" });
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
