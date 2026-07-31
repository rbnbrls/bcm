import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateChangeTypeAdmin } from "@/app/admin/change-types/actions";
import { updateChangeTypeConfig } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  updateChangeTypeActive: vi.fn(),
  updateChangeTypeConfig: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const validId = "00000000-0000-4000-a000-000000000001";

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("id", validId);
  formData.set("active", "false");
  formData.set("baseCost", "1250");
  formData.set("perItemCost", "25");
  formData.set("costCurrency", "eur");
  formData.set("costDescription", "Kostentekst voor regressietest");
  formData.set("defaultLeadDays", "10");
  formData.set("sortOrder", "3");

  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }

  return formData;
}

describe("updateChangeTypeAdmin", () => {
  beforeEach(() => {
    vi.mocked(updateChangeTypeConfig).mockReset();
  });

  it("saves checked frontend-active toggle without losing the change type id", async () => {
    const formData = buildFormData();
    formData.append("active", "true");

    const result = await updateChangeTypeAdmin({}, formData);

    expect(result).toEqual({ message: "Change type opgeslagen." });
    expect(updateChangeTypeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        id: validId,
        active: true,
      }),
    );
  });

  it("saves unchecked frontend-active toggle as false", async () => {
    const result = await updateChangeTypeAdmin({}, buildFormData());

    expect(result).toEqual({ message: "Change type opgeslagen." });
    expect(updateChangeTypeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        id: validId,
        active: false,
      }),
    );
  });

  it("accepts edited cost text as the cost description field", async () => {
    const formData = buildFormData({
      costDescription: "Aangepaste kostentekst",
    });

    const result = await updateChangeTypeAdmin({}, formData);

    expect(result).toEqual({ message: "Change type opgeslagen." });
    expect(updateChangeTypeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        cost: expect.objectContaining({
          description: "Aangepaste kostentekst",
        }),
      }),
    );
  });
});
