/**
 * Tests for the deletePortfolioConfig server action.
 *
 * Uses vi.mock at the top level to mock the dependencies (getChangeRequest,
 * deleteChangePortfolioConfiguration, revalidatePath).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Top-level mocks are hoisted by vitest
vi.mock("@/lib/db", () => ({
  getChangeRequest: vi.fn(),
}));

vi.mock("@/lib/client-config-db", () => ({
  deleteChangePortfolioConfiguration: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Import the action AFTER mocks are set up
import { deletePortfolioConfig } from "@/app/changes/actions";
import { getChangeRequest } from "@/lib/db";
import { deleteChangePortfolioConfiguration } from "@/lib/client-config-db";

describe("deletePortfolioConfig server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when stagedRowId is missing", async () => {
    const formData = new FormData();
    formData.set("changeRequestId", "11111111-1111-1111-1111-111111111111");

    const result = await deletePortfolioConfig({ success: false, message: "" }, formData);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Ontbrekende");
    expect(getChangeRequest).not.toHaveBeenCalled();
    expect(deleteChangePortfolioConfiguration).not.toHaveBeenCalled();
  });

  it("rejects when changeRequestId is missing", async () => {
    const formData = new FormData();
    formData.set("stagedRowId", "1");

    const result = await deletePortfolioConfig({ success: false, message: "" }, formData);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Ontbrekende");
    expect(getChangeRequest).not.toHaveBeenCalled();
  });

  it("rejects when change request is not found", async () => {
    vi.mocked(getChangeRequest).mockResolvedValue(null);

    const formData = new FormData();
    formData.set("stagedRowId", "1");
    formData.set("changeRequestId", "11111111-1111-1111-1111-111111111111");

    const result = await deletePortfolioConfig({ success: false, message: "" }, formData);
    expect(result.success).toBe(false);
    expect(result.message).toContain("niet gevonden");
    expect(deleteChangePortfolioConfiguration).not.toHaveBeenCalled();
  });

  it("rejects for processed change requests", async () => {
    vi.mocked(getChangeRequest).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      status: "processed",
    } as any);

    const formData = new FormData();
    formData.set("stagedRowId", "1");
    formData.set("changeRequestId", "11111111-1111-1111-1111-111111111111");

    const result = await deletePortfolioConfig({ success: false, message: "" }, formData);
    expect(result.success).toBe(false);
    expect(result.message).toContain("niet toegestaan");
    expect(deleteChangePortfolioConfiguration).not.toHaveBeenCalled();
  });

  it("rejects for rejected change requests", async () => {
    vi.mocked(getChangeRequest).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      status: "rejected",
    } as any);

    const formData = new FormData();
    formData.set("stagedRowId", "1");
    formData.set("changeRequestId", "11111111-1111-1111-1111-111111111111");

    const result = await deletePortfolioConfig({ success: false, message: "" }, formData);
    expect(result.success).toBe(false);
    expect(result.message).toContain("niet toegestaan");
    expect(deleteChangePortfolioConfiguration).not.toHaveBeenCalled();
  });

  it("rejects for approved change requests", async () => {
    vi.mocked(getChangeRequest).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      status: "approved",
    } as any);

    const formData = new FormData();
    formData.set("stagedRowId", "1");
    formData.set("changeRequestId", "11111111-1111-1111-1111-111111111111");

    const result = await deletePortfolioConfig({ success: false, message: "" }, formData);
    expect(result.success).toBe(false);
    expect(result.message).toContain("niet toegestaan");
    expect(deleteChangePortfolioConfiguration).not.toHaveBeenCalled();
  });

  it("returns failure when deleteChangePortfolioConfiguration returns false (row not found)", async () => {
    vi.mocked(getChangeRequest).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      status: "submitted",
    } as any);
    vi.mocked(deleteChangePortfolioConfiguration).mockResolvedValue(false);

    const formData = new FormData();
    formData.set("stagedRowId", "999");
    formData.set("changeRequestId", "11111111-1111-1111-1111-111111111111");

    const result = await deletePortfolioConfig({ success: false, message: "" }, formData);
    expect(result.success).toBe(false);
    expect(result.message).toContain("niet gevonden");
    expect(deleteChangePortfolioConfiguration).toHaveBeenCalledWith(999);
  });

  it("deletes a staged row for a draft change request", async () => {
    vi.mocked(getChangeRequest).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      status: "draft",
    } as any);
    vi.mocked(deleteChangePortfolioConfiguration).mockResolvedValue(true);

    const formData = new FormData();
    formData.set("stagedRowId", "1");
    formData.set("changeRequestId", "11111111-1111-1111-1111-111111111111");

    const result = await deletePortfolioConfig({ success: false, message: "" }, formData);
    expect(result.success).toBe(true);
    expect(result.message).toContain("verwijderd");
    expect(deleteChangePortfolioConfiguration).toHaveBeenCalledWith(1);
  });

  it("deletes a staged row for a submitted change request", async () => {
    vi.mocked(getChangeRequest).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      status: "submitted",
    } as any);
    vi.mocked(deleteChangePortfolioConfiguration).mockResolvedValue(true);

    const formData = new FormData();
    formData.set("stagedRowId", "2");
    formData.set("changeRequestId", "11111111-1111-1111-1111-111111111111");

    const result = await deletePortfolioConfig({ success: false, message: "" }, formData);
    expect(result.success).toBe(true);
    expect(result.message).toContain("verwijderd");
    expect(deleteChangePortfolioConfiguration).toHaveBeenCalledWith(2);
  });

  it("deletes a staged row for an accepted change request", async () => {
    vi.mocked(getChangeRequest).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      status: "accepted",
    } as any);
    vi.mocked(deleteChangePortfolioConfiguration).mockResolvedValue(true);

    const formData = new FormData();
    formData.set("stagedRowId", "3");
    formData.set("changeRequestId", "11111111-1111-1111-1111-111111111111");

    const result = await deletePortfolioConfig({ success: false, message: "" }, formData);
    expect(result.success).toBe(true);
    expect(result.message).toContain("verwijderd");
    expect(deleteChangePortfolioConfiguration).toHaveBeenCalledWith(3);
  });

  it("handles errors from deleteChangePortfolioConfiguration gracefully", async () => {
    vi.mocked(getChangeRequest).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      status: "submitted",
    } as any);
    vi.mocked(deleteChangePortfolioConfiguration).mockRejectedValue(new Error("DB error"));

    const formData = new FormData();
    formData.set("stagedRowId", "1");
    formData.set("changeRequestId", "11111111-1111-1111-1111-111111111111");

    const result = await deletePortfolioConfig({ success: false, message: "" }, formData);
    expect(result.success).toBe(false);
    expect(result.message).toContain("DB error");
  });
});
