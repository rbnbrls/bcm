/**
 * Tests for the amendPortfolioConfig server action.
 *
 * Uses vi.mock at the top level to mock the dependencies (getChangeRequest,
 * updateChangePortfolioConfiguration, revalidatePath).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Top-level mocks are hoisted by vitest — these apply to ALL tests in this file
vi.mock("@/lib/db", () => ({
  getChangeRequest: vi.fn(),
}));

vi.mock("@/lib/client-config-db", () => ({
  updateChangePortfolioConfiguration: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Import the action AFTER mocks are set up
import { amendPortfolioConfig } from "@/app/changes/actions";
import { getChangeRequest } from "@/lib/db";
import { updateChangePortfolioConfiguration } from "@/lib/client-config-db";

describe("amendPortfolioConfig server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when the change request is in draft status", async () => {
    vi.mocked(getChangeRequest).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      status: "draft",
    } as any);

    const formData = new FormData();
    formData.set("stagedRowId", "1");
    formData.set("changeRequestId", "11111111-1111-1111-1111-111111111111");
    formData.set("field_long_name", "Updated name");

    const result = await amendPortfolioConfig({ success: false, message: "" }, formData);
    expect(result.success).toBe(false);
    expect(result.message).toContain("niet toegestaan");
    expect(updateChangePortfolioConfiguration).not.toHaveBeenCalled();
  });

  it("rejects when stagedRowId is missing", async () => {
    const formData = new FormData();
    formData.set("changeRequestId", "11111111-1111-1111-1111-111111111111");

    const result = await amendPortfolioConfig({ success: false, message: "" }, formData);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Ontbrekende");
    expect(getChangeRequest).not.toHaveBeenCalled();
  });

  it("rejects when change request is not found", async () => {
    vi.mocked(getChangeRequest).mockResolvedValue(null);

    const formData = new FormData();
    formData.set("stagedRowId", "1");
    formData.set("changeRequestId", "11111111-1111-1111-1111-111111111111");
    formData.set("field_long_name", "Updated name");

    const result = await amendPortfolioConfig({ success: false, message: "" }, formData);
    expect(result.success).toBe(false);
    expect(result.message).toContain("niet gevonden");
    expect(updateChangePortfolioConfiguration).not.toHaveBeenCalled();
  });

  it("rejects when no field data is provided", async () => {
    vi.mocked(getChangeRequest).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      status: "submitted",
    } as any);

    const formData = new FormData();
    formData.set("stagedRowId", "1");
    formData.set("changeRequestId", "11111111-1111-1111-1111-111111111111");

    const result = await amendPortfolioConfig({ success: false, message: "" }, formData);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Geen velden");
    expect(updateChangePortfolioConfiguration).not.toHaveBeenCalled();
  });

  it("updates a staged row for a submitted change request", async () => {
    vi.mocked(getChangeRequest).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      status: "submitted",
    } as any);

    const formData = new FormData();
    formData.set("stagedRowId", "1");
    formData.set("changeRequestId", "11111111-1111-1111-1111-111111111111");
    formData.set("field_long_name", "Updated name");
    formData.set("field_short_name", "UPD");

    const result = await amendPortfolioConfig({ success: false, message: "" }, formData);
    expect(result.success).toBe(true);
    expect(result.message).toContain("opgeslagen");
    expect(updateChangePortfolioConfiguration).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        longName: "Updated name",
        shortName: "UPD",
      }),
    );
  });

  it("allows amending an accepted change request", async () => {
    vi.mocked(getChangeRequest).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      status: "accepted",
    } as any);

    const formData = new FormData();
    formData.set("stagedRowId", "1");
    formData.set("changeRequestId", "11111111-1111-1111-1111-111111111111");
    formData.set("field_benchmark_code", "MSCI-EM-NR");

    const result = await amendPortfolioConfig({ success: false, message: "" }, formData);
    expect(result.success).toBe(true);
    expect(updateChangePortfolioConfiguration).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        benchmarkCode: "MSCI-EM-NR",
      }),
    );
  });

  it("rejects for processed change requests", async () => {
    vi.mocked(getChangeRequest).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      status: "processed",
    } as any);

    const formData = new FormData();
    formData.set("stagedRowId", "1");
    formData.set("changeRequestId", "11111111-1111-1111-1111-111111111111");
    formData.set("field_long_name", "Should not work");

    const result = await amendPortfolioConfig({ success: false, message: "" }, formData);
    expect(result.success).toBe(false);
    expect(result.message).toContain("niet toegestaan");
    expect(updateChangePortfolioConfiguration).not.toHaveBeenCalled();
  });
});
