/**
 * User-workflow tests for the generic change-request server action.
 *
 * These tests exercise the action as a boundary: authorization, submitted
 * FormData, catalog/client integrity checks, persistence, and redirect.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangeTypeConfig } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  getClientConfigs: vi.fn(),
  getChangeTypeBySlug: vi.fn(),
  getChangeTypeById: vi.fn(),
  getBenchmarks: vi.fn(),
  saveChangeRequest: vi.fn(),
  reportError: vi.fn(),
  requirePermission: vi.fn(),
  accessDeniedIssue: vi.fn(),
  getChangeTypePermission: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getClientConfigs: mocks.getClientConfigs,
  getChangeTypeBySlug: mocks.getChangeTypeBySlug,
  getChangeTypeById: mocks.getChangeTypeById,
  getBenchmarks: mocks.getBenchmarks,
  saveChangeRequest: mocks.saveChangeRequest,
}));

vi.mock("@/lib/error-reporter", () => ({ reportError: mocks.reportError }));

vi.mock("@/lib/rbac-request", () => ({
  requirePermission: mocks.requirePermission,
  accessDeniedIssue: mocks.accessDeniedIssue,
}));

vi.mock("@/lib/change-type-registry", () => ({
  getChangeTypePermission: mocks.getChangeTypePermission,
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { createGenericChangeRequest } from "@/app/changes/new/generic-actions";

const CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93";
const PORTFOLIO_ID = "c4707067-b98a-4a0f-92c7-5ee510dc70ff";
const OTHER_PORTFOLIO_ID = "d5707067-b98a-4a0f-92c7-5ee510dc70ff";
const BENCHMARK_ID = "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1";

const config: ChangeTypeConfig = {
  id: "a0000000-0000-0000-0000-000000000003",
  slug: "fee_change",
  name: "Tariefwijziging",
  description: "Wijzig het tarief van een portefeuille.",
  category: "general",
  fields: [
    {
      key: "portfolio_id",
      label: "Portefeuille",
      type: "select",
      required: true,
      referenceTable: "portfolios",
    },
    {
      key: "current_fee",
      label: "Huidig tarief",
      type: "number",
      required: true,
      min: 0,
    },
    {
      key: "requested_fee",
      label: "Gewenst tarief",
      type: "number",
      required: true,
      min: 0,
    },
    {
      key: "requested_benchmark_id",
      label: "Benchmark",
      type: "benchmark",
      required: true,
      referenceTable: "benchmark_catalog",
    },
  ],
  istSollMapping: [
    {
      ist: "current_fee",
      soll: "requested_fee",
      labelIst: "Huidig tarief",
      labelSoll: "Gewenst tarief",
    },
  ],
  cost: {
    baseCost: 100,
    perItemCost: 25,
    costCurrency: "EUR",
    description: "Basiskosten plus portefeuillekosten",
  },
  defaultLeadDays: 7,
  stakeholders: [
    {
      id: "operations",
      name: "Operations",
      role: "Uitvoerder",
      notifyOn: ["on_submit"],
      mandatory: true,
    },
    {
      id: "observer",
      name: "Observer",
      role: "Lezer",
      notifyOn: ["on_submit"],
      mandatory: false,
    },
  ],
  workflow: "default",
  active: true,
  sortOrder: 3,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const client = {
  id: CLIENT_ID,
  name: "Workflow Client",
  externalReference: "WF01",
  portfolios: [
    {
      id: PORTFOLIO_ID,
      name: "Workflow Portfolio",
      externalReference: "WFP01",
    },
  ],
};

function formData(overrides: Record<string, string> = {}): FormData {
  const values = {
    changeTypeSlug: config.slug,
    clientId: CLIENT_ID,
    requestedBy: "Workflow Tester",
    rationale: "Een voldoende lange reden voor deze wijziging.",
    effectiveDate: "2099-01-01",
    portfolio_id: PORTFOLIO_ID,
    current_fee: "0.45",
    requested_fee: "0.50",
    requested_benchmark_id: BENCHMARK_ID,
    ...overrides,
  };
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getChangeTypePermission.mockReturnValue("change:create:fee_change");
  mocks.requirePermission.mockResolvedValue({
    authorized: true,
    role: "requester",
    label: "Aanvrager",
    identity: {
      userId: "requester-1",
      displayName: "Test Requester",
      groups: ["bcm:role:change_manager"],
      tenant: "test",
      businessUnit: "test",
      sessionId: "session-1",
    },
  });
  mocks.accessDeniedIssue.mockImplementation(
    (access: { message: string; label: string }) =>
      `${access.message} Actief profiel: ${access.label}.`,
  );
  mocks.getChangeTypeBySlug.mockResolvedValue(config);
  mocks.getChangeTypeById.mockResolvedValue(config);
  mocks.getClientConfigs.mockResolvedValue([client]);
  mocks.getBenchmarks.mockResolvedValue([
    { id: BENCHMARK_ID, code: "BM1", name: "Benchmark 1", assetClass: "Equity" },
  ]);
  mocks.saveChangeRequest.mockResolvedValue(undefined);
  mocks.reportError.mockResolvedValue(undefined);
  mocks.redirect.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  });
});

describe("requesting a generic change", () => {
  it("stops unauthorized users before reading or writing request data", async () => {
    mocks.requirePermission.mockResolvedValue({
      authorized: false,
      role: "viewer",
      label: "Lezer",
      message: "Je mag dit change type niet aanvragen.",
    });

    const result = await createGenericChangeRequest({}, formData());

    expect(result).toEqual({
      issues: ["Je mag dit change type niet aanvragen. Actief profiel: Lezer."],
    });
    expect(mocks.getChangeTypeBySlug).not.toHaveBeenCalled();
    expect(mocks.saveChangeRequest).not.toHaveBeenCalled();
  });

  it.each([
    [
      "new_asset_class",
      "/asset-class-aanvraag",
    ],
    [
      "new_sub_asset_class",
      "/sub-asset-class-aanvraag",
    ],
  ])("routes %s requests to its dedicated workflow", async (slug, route) => {
    const result = await createGenericChangeRequest(
      {},
      formData({ changeTypeSlug: slug }),
    );

    expect(result.issues).toEqual([expect.stringContaining(route)]);
    expect(mocks.getChangeTypeBySlug).not.toHaveBeenCalled();
    expect(mocks.saveChangeRequest).not.toHaveBeenCalled();
  });

  it("returns all standard-field validation errors without touching the database", async () => {
    const result = await createGenericChangeRequest(
      {},
      formData({ clientId: "not-a-uuid", requestedBy: " ", rationale: "kort", effectiveDate: "bad-date" }),
    );

    expect(result.issues).toEqual(expect.arrayContaining([
      "Selecteer een geldige klant.",
      "Vul de naam van de aanvrager in.",
      "Licht de reden van de wijziging in minimaal 10 tekens toe.",
      "Kies een geldige ingangsdatum.",
    ]));
    expect(mocks.getChangeTypeBySlug).not.toHaveBeenCalled();
    expect(mocks.saveChangeRequest).not.toHaveBeenCalled();
  });

  it("rejects inactive change types", async () => {
    mocks.getChangeTypeBySlug.mockResolvedValue({ ...config, active: false });

    const result = await createGenericChangeRequest({}, formData());

    expect(result).toEqual({
      issues: ['Change type "Tariefwijziging" is gedeactiveerd voor nieuwe aanvragen.'],
    });
    expect(mocks.saveChangeRequest).not.toHaveBeenCalled();
  });

  it("rejects a change type that lacks a persisted database config", async () => {
    mocks.getChangeTypeById.mockResolvedValue(null);

    const result = await createGenericChangeRequest({}, formData());

    expect(mocks.getChangeTypeById).toHaveBeenCalledWith(config.id, true);
    expect(result.issues?.[0]).toContain("bestaat niet in de database");
    expect(mocks.saveChangeRequest).not.toHaveBeenCalled();
  });

  it("rejects an unknown client", async () => {
    mocks.getClientConfigs.mockResolvedValue([]);

    const result = await createGenericChangeRequest({}, formData());

    expect(result).toEqual({ issues: ["De gekozen klant bestaat niet in de client config."] });
    expect(mocks.saveChangeRequest).not.toHaveBeenCalled();
  });

  it("returns dynamic field errors before validating catalog references", async () => {
    const result = await createGenericChangeRequest(
      {},
      formData({ requested_fee: "" }),
    );

    expect(result).toEqual({ issues: ["Gewenst tarief is verplicht."] });
    expect(mocks.getBenchmarks).not.toHaveBeenCalled();
    expect(mocks.saveChangeRequest).not.toHaveBeenCalled();
  });

  it("rejects a portfolio that does not belong to the selected client", async () => {
    const result = await createGenericChangeRequest(
      {},
      formData({ portfolio_id: OTHER_PORTFOLIO_ID }),
    );

    expect(result).toEqual({
      issues: ["Portefeuille: de gekozen portefeuille hoort niet bij Workflow Client."],
    });
    expect(mocks.getBenchmarks).not.toHaveBeenCalled();
    expect(mocks.saveChangeRequest).not.toHaveBeenCalled();
  });

  it("rejects a benchmark that is absent from the catalog", async () => {
    mocks.getBenchmarks.mockResolvedValue([]);

    const result = await createGenericChangeRequest({}, formData());

    expect(result).toEqual({
      issues: ["Benchmark: de gekozen benchmark bestaat niet in de catalogus."],
    });
    expect(mocks.saveChangeRequest).not.toHaveBeenCalled();
  });

  it("persists a valid request with its estimate, IST/SOLL values, and mandatory stakeholders", async () => {
    await expect(createGenericChangeRequest({}, formData())).rejects.toThrow(
      /^REDIRECT:\/changes\/[0-9a-f-]+$/,
    );

    expect(mocks.saveChangeRequest).toHaveBeenCalledOnce();
    const saved = mocks.saveChangeRequest.mock.calls[0][0];
    expect(saved).toMatchObject({
      changeType: "fee_change",
      changeTypeId: config.id,
      clientId: CLIENT_ID,
      requestedBy: "Test Requester",
      rationale: "Een voldoende lange reden voor deze wijziging.",
      effectiveDate: "2099-01-01",
      estimatedCost: 125,
      estimatedCostCurrency: "EUR",
      estimatedLeadDays: 7,
      stakeholderAssignments: [
        {
          stakeholderId: "operations",
          contact: "operations@bcm.example.com",
          notifiedAt: null,
        },
      ],
    });
    expect(saved.fields).toEqual([
      { fieldKey: "requested_fee", istValue: 0.45, sollValue: 0.5 },
      { fieldKey: "portfolio_id", istValue: PORTFOLIO_ID, sollValue: PORTFOLIO_ID },
      { fieldKey: "requested_benchmark_id", istValue: BENCHMARK_ID, sollValue: BENCHMARK_ID },
    ]);
    expect(mocks.redirect).toHaveBeenCalledWith(`/changes/${saved.id}`);
  });

  it("reports persistence failures and gives the user an actionable issue", async () => {
    mocks.saveChangeRequest.mockRejectedValue(new Error("Databaseverbinding verbroken."));

    const result = await createGenericChangeRequest({}, formData());

    expect(result).toEqual({ issues: ["Databaseverbinding verbroken."] });
    expect(mocks.reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        action: "create-generic-change",
        userMessage: "De change kon niet worden opgeslagen.",
        tags: expect.objectContaining({
        requestedBy: "Test Requester",
          changeTypeSlug: "fee_change",
        }),
      }),
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
