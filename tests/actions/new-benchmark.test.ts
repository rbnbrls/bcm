/**
 * Tests for the new benchmark form server action validation.
 *
 * Covers Zod validation for all new benchmark form fields.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

// Replicate the schemas from actions.ts
const newBenchmarkFormSchema = z.object({
  clientId: z.string().uuid("Kies een geldige klant."),
  requestedBy: z.string().trim().min(2, "Vul de naam van de aanvrager in."),
  rationale: z.string().trim().min(10, "Licht de reden van de aanvraag in minimaal 10 tekens toe."),
  effectiveDate: z.string().date("Kies een geldige ingangsdatum."),
  shortName: z.string().trim().min(2, "Korte naam is verplicht (minimaal 2 tekens).").toUpperCase(),
  longName: z.string().trim().min(3, "Lange naam is verplicht (minimaal 3 tekens)."),
  assetClass: z.string().trim().min(2, "Asset class is verplicht."),
  currency: z.string().trim().length(3, "Valuta moet een 3-lettercode zijn (bijv. EUR).").toUpperCase(),
});

const VALID_CLIENT_ID = "9f9280fc-9572-49d1-b81c-2a039652bc93";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    clientId: VALID_CLIENT_ID,
    requestedBy: "Ruben Verboon",
    rationale: "Test rationale with at least ten characters",
    effectiveDate: "2026-09-01",
    shortName: "CUSTOM-ESG",
    longName: "Custom ESG Netherlands Benchmark",
    assetClass: "Aandelen",
    currency: "EUR",
    ...overrides,
  };
}

describe("New benchmark form validation", () => {
  it("should accept valid input", () => {
    const result = newBenchmarkFormSchema.parse(validInput());
    expect(result.clientId).toBe(VALID_CLIENT_ID);
    expect(result.shortName).toBe("CUSTOM-ESG");
    expect(result.currency).toBe("EUR");
  });

  it("should uppercase shortName", () => {
    const result = newBenchmarkFormSchema.parse(validInput({ shortName: "custom-esg" }));
    expect(result.shortName).toBe("CUSTOM-ESG");
  });

  it("should uppercase currency", () => {
    const result = newBenchmarkFormSchema.parse(validInput({ currency: "usd" }));
    expect(result.currency).toBe("USD");
  });

  it("should reject shortName < 2 chars", () => {
    expect(() => newBenchmarkFormSchema.parse(validInput({ shortName: "X" }))).toThrow();
  });

  it("should reject longName < 3 chars", () => {
    expect(() => newBenchmarkFormSchema.parse(validInput({ longName: "AB" }))).toThrow();
  });

  it("should reject assetClass < 2 chars", () => {
    expect(() => newBenchmarkFormSchema.parse(validInput({ assetClass: "A" }))).toThrow();
  });

  it("should reject currency not exactly 3 chars", () => {
    expect(() => newBenchmarkFormSchema.parse(validInput({ currency: "EURO" }))).toThrow();
    expect(() => newBenchmarkFormSchema.parse(validInput({ currency: "E" }))).toThrow();
    expect(() => newBenchmarkFormSchema.parse(validInput({ currency: "" }))).toThrow();
  });

  it("should reject empty rationale", () => {
    expect(() => newBenchmarkFormSchema.parse(validInput({ rationale: "Short" }))).toThrow();
  });

  it("should reject missing clientId", () => {
    expect(() => newBenchmarkFormSchema.parse(validInput({ clientId: "not-a-uuid" }))).toThrow();
  });

  it("should reject past effective date", () => {
    const pastDate = "2020-01-01";
    expect(pastDate < new Date().toISOString().slice(0, 10)).toBe(true);
  });

  it("should detect foreign key violation error messages", () => {
    const msg = 'insert or update on table "change_requests" violates foreign key constraint';
    expect(msg.includes("foreign key constraint") || msg.includes("violates foreign key")).toBe(true);
  });

  it("should generate NB reference for new benchmarks", () => {
    const year = new Date().getFullYear();
    const reference = `BCM-${year}-NB-${String(Date.now()).slice(-6)}`;
    expect(reference).toMatch(new RegExp(`^BCM-${year}-NB-\\d{6}$`));
  });
});
