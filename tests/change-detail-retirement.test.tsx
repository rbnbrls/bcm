// @vitest-environment jsdom
/**
 * Render tests for the change request detail page (app/changes/[id]/page.tsx)
 * when the change is a retirement (portfolio_configuration_retire / DELETE).
 *
 * Acceptance covered here:
 *  - change detail highlights the retirement intent: header title, a
 *    retirement banner with the target portfolio configuration, effective
 *    date and rationale, and a scope that names the target instead of
 *    "0 portefeuille(s)"
 *  - audit logs show "Retired portfolio configuration X effective Y"
 *    (rendered in Dutch: "Portefeuilleconfiguratie X beëindigd per Y")
 *
 * The page is a server component; lib/db is mocked so no database is needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import ChangeRequestPage from "@/app/changes/[id]/page";

vi.mock("@/lib/db", () => ({
  getChangeRequest: vi.fn(),
  getAuditLogs: vi.fn(),
  getApprovals: vi.fn(),
  getChangeTypeBySlug: vi.fn(),
}));

import { getChangeRequest, getAuditLogs, getApprovals } from "@/lib/db";

const mockedGetChangeRequest = vi.mocked(getChangeRequest);
const mockedGetAuditLogs = vi.mocked(getAuditLogs);
const mockedGetApprovals = vi.mocked(getApprovals);

const RETIRE_CONFIG = {
  id: "ct-retire",
  slug: "portfolio_configuration_retire",
  name: "Portefeuilleconfiguratie beëindigen",
  description: "Beëindig (retire) een bestaande portefeuilleconfiguratie",
  category: "portfolio",
  fields: [],
  cost: { baseCost: 100, costCurrency: "EUR", description: "" },
  defaultLeadDays: 3,
  stakeholders: [],
  workflow: "portfolio_configuration_retire",
  active: true,
  sortOrder: 10,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function retireRequest(overrides: Record<string, unknown> = {}): any {
  return {
    id: "cr-retire-1",
    reference: "CR-2026-001",
    changeType: "portfolio_configuration_retire",
    changeTypeId: "ct-retire",
    clientName: "Holdingmaatschappij",
    clientReference: "HOR",
    clientId: "client-1",
    requestedBy: "Ruben Verboon",
    rationale: "Deelportefeuille afgestoten; configuratie niet langer van toepassing.",
    effectiveDate: "2026-12-01",
    status: "submitted",
    createdAt: "2026-08-01T10:00:00Z",
    submittedAt: "2026-08-01T10:00:00Z",
    slaLeadWeeks: 3,
    daysOpen: 2,
    slaStatus: "ok",
    statusUpdatedAt: "2026-08-01T10:00:00Z",
    processedAt: null,
    processedBy: null,
    validatedAt: null,
    validatedBy: null,
    notificationSent: false,
    items: [],
    changeTypeConfig: RETIRE_CONFIG,
    fields: [
      { fieldKey: "primary_account_id", istValue: "HOR-EQ-DEV-EIG", sollValue: "HOR-EQ-DEV-EIG" },
      { fieldKey: "action_type", istValue: null, sollValue: "DELETE" },
      { fieldKey: "portfolio_code", istValue: "HORRP", sollValue: "HORRP" },
      { fieldKey: "long_name", istValue: "Holdingmaatschappij Rijnland Portefeuille", sollValue: "Holdingmaatschappij Rijnland Portefeuille" },
    ],
    changePortfolioConfigurations: [
      {
        id: 1,
        changeRequestId: "cr-retire-1",
        actionType: "DELETE",
        targetPrimaryAccountId: "HOR-EQ-DEV-EIG",
        clientCode: "HOR",
        portfolioCode: "HORRP",
        assetClassCode: "EQ",
        subAssetClassCode: "DEV",
        managerCode: "EIG",
        benchmarkCode: "MSCI",
        npcClassificationId: 5,
        longName: "Holdingmaatschappij Rijnland Portefeuille",
        shortName: "HRP",
        effectiveFrom: "2026-12-01",
        effectiveUntil: null,
        applyStatus: null,
        applyError: null,
      },
    ],
    ...overrides,
  };
}

function benchmarkSwitchRequest(): any {
  return {
    id: "cr-switch-1",
    reference: "CR-2026-002",
    changeType: "benchmark_switch",
    clientName: "Holdingmaatschappij",
    clientReference: "HOR",
    clientId: "client-1",
    requestedBy: "Ruben Verboon",
    rationale: "Indexwijziging naar nieuwe benchmark.",
    effectiveDate: "2026-12-01",
    status: "submitted",
    createdAt: "2026-08-01T10:00:00Z",
    submittedAt: "2026-08-01T10:00:00Z",
    slaLeadWeeks: 1,
    daysOpen: 2,
    slaStatus: "ok",
    statusUpdatedAt: "2026-08-01T10:00:00Z",
    processedAt: null,
    processedBy: null,
    validatedAt: null,
    validatedBy: null,
    notificationSent: false,
    items: [
      {
        portfolioName: "Rijnland Portefeuille",
        portfolioReference: "HORRP",
        previousBenchmark: { id: "b1", code: "MSCI", name: "MSCI World", assetClass: "EQ", currency: "USD", cost: 1000, provider: "rimes" },
        requestedBenchmark: { id: "b2", code: "FTSE", name: "FTSE World", assetClass: "EQ", currency: "USD", cost: 1000, provider: "rimes" },
      },
    ],
    changePortfolioConfigurations: [],
  };
}

async function renderPage(id = "cr-retire-1") {
  const element = await ChangeRequestPage({ params: Promise.resolve({ id }) });
  return render(element);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAuditLogs.mockResolvedValue([
    {
      id: "cr-retire-1-audit-request",
      changeRequestId: "cr-retire-1",
      action: "requested",
      actor: "Ruben Verboon",
      previousStatus: null,
      newStatus: "pending_approval",
      diffSnapshot: null,
      clientConfigVersion: "1.0",
      createdAt: "2026-08-01T10:00:00Z",
    },
  ]);
  mockedGetApprovals.mockResolvedValue([]);
});

describe("change detail page — retirement intent", () => {
  it("shows the retirement title in the header instead of 'Benchmarkwissel'", async () => {
    mockedGetChangeRequest.mockResolvedValue(retireRequest());
    await renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Portefeuilleconfiguratie beëindigen" }),
    ).toBeTruthy();
  });

  it("renders a retirement banner with target configuration, effective date and rationale", async () => {
    mockedGetChangeRequest.mockResolvedValue(retireRequest());
    await renderPage();

    const banner = screen.getByLabelText("Beëindiging portefeuilleconfiguratie");
    expect(banner).toBeTruthy();

    const bannerText = banner.textContent ?? "";
    // Target portfolio configuration identity
    expect(bannerText).toContain("HOR-EQ-DEV-EIG");
    // Portfolio code + long name
    expect(bannerText).toContain("HORRP");
    expect(bannerText).toContain("Holdingmaatschappij Rijnland Portefeuille");
    // Effective date of the retirement
    expect(bannerText).toContain("1 december 2026");
    expect(bannerText).toContain("Ingangsdatum beëindiging");
    // Rationale
    expect(bannerText).toContain("Deelportefeuille afgestoten");
  });

  it("shows the target configuration in the overview scope instead of '0 portefeuille(s)'", async () => {
    mockedGetChangeRequest.mockResolvedValue(retireRequest());
    await renderPage();

    const overview = screen.getByLabelText("Aanvraag overzicht");
    expect(within(overview).getByText("1 portefeuilleconfiguratie")).toBeTruthy();
  });

  it("skips the generic IST/SOLL diff section for a retirement change", async () => {
    mockedGetChangeRequest.mockResolvedValue(retireRequest());
    await renderPage();

    // The fields-based diff (CONFIGURATIEVERSCHIL) must not render: for a
    // DELETE change every field is IST=SOLL so the diff would be noise.
    expect(screen.queryByText("CONFIGURATIEVERSCHIL")).toBeNull();
    // The staged-config section (with the Beëindigen badge) still renders.
    expect(screen.getByText("CLIENT-CONFIGURATIE")).toBeTruthy();
  });

  it("renders the retirement audit sentence in the audit trail", async () => {
    mockedGetChangeRequest.mockResolvedValue(retireRequest());
    await renderPage();

    const auditSection = screen.getByLabelText("Audit trail");
    expect(auditSection).toBeTruthy();

    const entry = auditSection.querySelector('[data-testid="retirement-audit-entry"]');
    expect(entry).not.toBeNull();
    expect(entry?.textContent).toContain("Beëindigd");
    expect(entry?.textContent).toContain("HOR-EQ-DEV-EIG");
    // Acceptance: audit logs show "Retired portfolio configuration X effective Y"
    expect(entry?.textContent).toContain(
      "Portefeuilleconfiguratie HOR-EQ-DEV-EIG beëindigd per 1 december 2026",
    );
    // The regular requested entry is still present below it
    expect(screen.getByText("Aangevraagd")).toBeTruthy();
  });

  it("shows the retirement badge on the staged config row", async () => {
    mockedGetChangeRequest.mockResolvedValue(retireRequest());
    await renderPage();

    expect(screen.getByText("Beëindigen")).toBeTruthy();
  });
});

describe("change detail page — non-retirement regression", () => {
  it("still renders 'Benchmarkwissel' and the IST/SOLL diff for a benchmark switch", async () => {
    mockedGetChangeRequest.mockResolvedValue(benchmarkSwitchRequest());
    await renderPage("cr-switch-1");

    expect(screen.getByRole("heading", { level: 1, name: "Benchmarkwissel" })).toBeTruthy();
    expect(screen.getByText("CONFIGURATIEVERSCHIL")).toBeTruthy();
    expect(screen.queryByTestId("retirement-audit-entry")).toBeNull();
    expect(screen.queryByLabelText("Beëindiging portefeuilleconfiguratie")).toBeNull();
  });
});
