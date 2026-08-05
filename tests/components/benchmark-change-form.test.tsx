// @vitest-environment jsdom
/**
 * Component tests for BenchmarkChangeForm error surfacing (t_3c61f22b).
 *
 * Guards the acceptance criteria for the #525 follow-up: a user who submits
 * with a missing or invalid client selection must see a clear,
 * human-readable message next to the Klant field (field-level) instead of a
 * raw server/database error. The server action returns the structured
 * `fieldErrors.clientCode` payload; this form must render it inline and not
 * duplicate it in the general error block.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BenchmarkChangeForm } from "@/components/benchmark-change-form";
import {
  demoClientConfigClients,
  demoClientConfigBenchmarks,
} from "@/lib/fixtures";
import { ACTIVE_ROLE_COOKIE } from "@/lib/rbac";
import type { BenchmarkSwitchPortfolioOption } from "@/lib/types";

// Mock the server action so the form's submit path can be exercised without
// a database (same pattern as tests/components/client-config-table-edit.test.tsx).
const { createBenchmarkChange } = vi.hoisted(() => ({
  createBenchmarkChange: vi.fn(),
}));
vi.mock("@/app/changes/new/actions", () => ({ createBenchmarkChange }));

const CLIENT_ERROR_MESSAGE =
  'Klant "HOR" is niet geregistreerd in de klantenadministratie. Neem contact op met de beheerder.';

function makePortfolioOption(): BenchmarkSwitchPortfolioOption {
  return {
    primaryAccountId: "HOR*EQACX*ROB",
    clientCode: "HOR",
    clientName: "Pensioenfonds Horizon",
    portfolioCode: "HORRP",
    parentAccountId: null,
    parentAccountCode: null,
    assetClassCode: "EQ",
    assetClassName: "Equities",
    subAssetClassCode: "ACX",
    subAssetClassName: "Active Global",
    managerCode: "ROB",
    managerName: "Robeco",
    benchmarkCode: "MSCI-WORLD-NR",
    benchmarkName: "MSCI World Net Return",
    npcClassificationId: 1,
    npcClassificationName: "Geen NPC",
    longName: "Horizon Active Equities",
    shortName: "HAE",
    activeInd: true,
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    changeRequestId: null,
  };
}

function renderForm() {
  return render(
    <BenchmarkChangeForm
      clients={demoClientConfigClients}
      portfolioOptions={[makePortfolioOption()]}
      benchmarks={demoClientConfigBenchmarks}
      minimumEffectiveDate="2026-01-01"
      leadDays={7}
    />,
  );
}

/** Select a portfolio row and a SOLL benchmark so the submit button enables. */
function fillRequiredSelections() {
  fireEvent.change(screen.getByLabelText(/Client-config regel/), {
    target: { value: "HOR*EQACX*ROB" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: /Kies SOLL benchmark/ }), {
    target: { value: "MSCI-ACWI-NR" },
  });
}

function submitForm() {
  const submit = screen.getByRole("button", { name: "Benchmarkwissel aanvragen" });
  fireEvent.submit((submit as HTMLButtonElement).closest("form")!);
}

beforeEach(() => {
  createBenchmarkChange.mockReset();
  document.cookie = `${ACTIVE_ROLE_COOKIE}=; Path=/; Max-Age=0`;
});

describe("BenchmarkChangeForm — invalid client error surfacing", () => {
  it("renders the server's client validation error inline under the Klant select", async () => {
    createBenchmarkChange.mockResolvedValue({
      issues: [CLIENT_ERROR_MESSAGE],
      fieldErrors: { clientCode: CLIENT_ERROR_MESSAGE },
    });

    renderForm();
    fillRequiredSelections();
    submitForm();

    // The message appears inline under the Klant field, flagged for
    // assistive tech — not only in the general block.
    const inlineError = await screen.findByTestId("field-error-clientCode");
    expect(inlineError).toHaveTextContent("niet geregistreerd in de klantenadministratie");
    expect(inlineError).toHaveAttribute("role", "alert");

    const clientSelect = screen.getByRole("combobox", { name: /Klant/ }) as HTMLSelectElement;
    expect(clientSelect).toHaveAttribute("aria-invalid", "true");
    expect(clientSelect).toHaveAttribute("aria-describedby", "client-field-error");

    // The general "Controleer de aanvraag" block does not duplicate the
    // message that already renders inline.
    expect(screen.queryByText("Controleer de aanvraag")).toBeNull();
  });

  it("shows the message under the Klant field even when it is the only issue", async () => {
    createBenchmarkChange.mockResolvedValue({
      issues: ['Klant "ZEK" bestaat niet in client_config.'],
      fieldErrors: { clientCode: 'Klant "ZEK" bestaat niet in client_config.' },
    });

    renderForm();
    fillRequiredSelections();
    submitForm();

    const inlineError = await screen.findByTestId("field-error-clientCode");
    expect(inlineError).toHaveTextContent('Klant "ZEK" bestaat niet in client_config.');
    expect(screen.queryByText("Controleer de aanvraag")).toBeNull();
  });

  it("keeps non-client issues in the general error block only", async () => {
    createBenchmarkChange.mockResolvedValue({
      issues: ["De SOLL-benchmark moet verschillen van de huidige IST-benchmark."],
    });

    renderForm();
    fillRequiredSelections();
    submitForm();

    const generalBlock = await screen.findByText("Controleer de aanvraag");
    expect(generalBlock).toBeTruthy();
    expect(
      screen.getByText("De SOLL-benchmark moet verschillen van de huidige IST-benchmark."),
    ).toBeTruthy();
    // No field-level client error for a non-client issue.
    expect(screen.queryByTestId("field-error-clientCode")).toBeNull();
  });

  it("submits visible controls directly and defaults the requester from the active profile", () => {
    document.cookie = `${ACTIVE_ROLE_COOKIE}=account_manager; Path=/`;

    renderForm();

    expect(screen.getByRole("combobox", { name: "Klant" })).toHaveAttribute("name", "clientCode");
    expect(screen.getByRole("combobox", { name: "Client-config regel" })).toHaveAttribute("name", "primaryAccountId");
    expect(screen.getByLabelText("Aanvrager")).toHaveValue("Arjan Accountmanager");
  });
});
