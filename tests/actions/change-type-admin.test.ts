import { beforeEach, describe, expect, it, vi, afterAll } from "vitest";
import { updateChangeTypeActiveAdmin, updateChangeTypeAdmin } from "@/app/admin/change-types/actions";
import { updateChangeTypeActive, updateChangeTypeConfig } from "@/lib/db";
import { headers } from "next/headers";

vi.mock("@/lib/db", () => ({
  updateChangeTypeActive: vi.fn(),
  updateChangeTypeConfig: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// The admin actions call requireAdmin() (lib/admin-auth-request.ts) which
// reads the Authorization header via next/headers. Simulate an
// authenticated admin request for the happy-path tests; the negative test
// overrides the mock per-call.
const { ADMIN_USER, ADMIN_PASSWORD, ADMIN_AUTH_HEADER } = vi.hoisted(() => {
  const user = "test-admin";
  const password = "test-password";
  return {
    ADMIN_USER: user,
    ADMIN_PASSWORD: password,
    ADMIN_AUTH_HEADER:
      "Basic " + Buffer.from(`${user}:${password}`).toString("base64"),
  };
});

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ authorization: ADMIN_AUTH_HEADER })),
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
    vi.mocked(updateChangeTypeActive).mockReset();
    process.env.ADMIN_USER = ADMIN_USER;
    process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  });

  afterAll(() => {
    delete process.env.ADMIN_USER;
    delete process.env.ADMIN_PASSWORD;
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

  it("saves active toggle submissions with hidden false and checked true values", async () => {
    const formData = new FormData();
    formData.set("id", validId);
    formData.append("active", "false");
    formData.append("active", "true");

    const result = await updateChangeTypeActiveAdmin({}, formData);

    expect(result).toEqual({ message: "Actief gemaakt." });
    expect(updateChangeTypeActive).toHaveBeenCalledWith({
      id: validId,
      active: true,
    });
  });

  it("saves disabled active toggle submissions as inactive", async () => {
    const formData = new FormData();
    formData.set("id", validId);
    formData.set("active", "false");

    const result = await updateChangeTypeActiveAdmin({}, formData);

    expect(result).toEqual({ message: "Inactief gemaakt." });
    expect(updateChangeTypeActive).toHaveBeenCalledWith({
      id: validId,
      active: false,
    });
  });

  it("rejects anonymous invocation of updateChangeTypeAdmin without writing", async () => {
    vi.mocked(headers).mockImplementationOnce(async () => new Headers());

    const result = await updateChangeTypeAdmin({}, buildFormData());

    expect(result.issues?.[0]).toMatch(/geautoriseerd/i);
    expect(updateChangeTypeConfig).not.toHaveBeenCalled();
  });

  it("rejects anonymous invocation of updateChangeTypeActiveAdmin without writing", async () => {
    vi.mocked(headers).mockImplementationOnce(async () => new Headers());

    const formData = new FormData();
    formData.set("id", validId);
    formData.append("active", "true");

    const result = await updateChangeTypeActiveAdmin({}, formData);

    expect(result.issues?.[0]).toMatch(/geautoriseerd/i);
    expect(updateChangeTypeActive).not.toHaveBeenCalled();
  });
});
