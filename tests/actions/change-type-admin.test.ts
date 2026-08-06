import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateChangeTypeActiveAdmin, updateChangeTypeAdmin, updateChangeTypeDefinitionAdmin } from "@/app/admin/change-types/actions";
import { updateChangeTypeActive, updateChangeTypeConfig, updateChangeTypeDefinition } from "@/lib/change-types/repository";
import { cookies } from "next/headers";

let mockIdentityRole = "admin";

vi.mock("@/lib/change-types/repository", () => ({
  updateChangeTypeActive: vi.fn(),
  updateChangeTypeConfig: vi.fn(),
  updateChangeTypeDefinition: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// The admin actions call requireAdmin() (lib/admin-auth-request.ts) which
// resolves the active role from the bcm_active_role RBAC cookie
// (lib/rbac-request.ts getActiveRole). Simulate an authenticated admin
// request; the negative tests override the cookie mock per-call.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "bcm_active_role" ? { name, value: "admin" } : undefined,
  })),
}));
vi.mock("@/lib/identity/request", () => ({
  getIdentityContext: vi.fn(async () => ({ userId: `${mockIdentityRole}-test`, displayName: "Test User", groups: [`bcm:role:${mockIdentityRole}`], tenant: "test", businessUnit: "test", sessionId: "test-session" })),
}));

const validId = "a0000000-0000-0000-0000-000000000001";
const validSlug = "benchmark_switch";

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("id", validId);
  formData.set("slug", validSlug);
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

function buildDefinitionFormData(overrides: Record<string, string> = {}): FormData {
  const formData = buildFormData({
    name: "Benchmarkwissel",
    description: "Wijzig de benchmark",
    extendedExplanation: "Uitgebreide uitleg",
    category: "benchmark",
    workflow: "generic_field_change",
    fieldsJson: JSON.stringify([
      { key: "portfolio_id", label: "Portefeuille", type: "select", required: true, referenceTable: "portfolios" },
    ]),
    istSollMappingJson: JSON.stringify([]),
    stakeholdersJson: JSON.stringify([
      { id: "internal_admin", name: "Interne administratie", role: "admin", notifyOn: ["on_submit"], mandatory: true, contactType: "email" },
    ]),
    processFlowJson: JSON.stringify([
      { stepOrder: 1, stakeholder: "Interne administratie", stakeholderId: "internal_admin", action: "Aanvraag indienen", leadTime: "1 werkdag", description: "Controleer de aanvraag." },
    ]),
    ...overrides,
  });
  return formData;
}

describe("updateChangeTypeAdmin", () => {
  beforeEach(() => {
    mockIdentityRole = "admin";
    vi.mocked(updateChangeTypeConfig).mockReset();
    vi.mocked(updateChangeTypeActive).mockReset();
    vi.mocked(updateChangeTypeDefinition).mockReset();
  });

  it("saves checked frontend-active toggle without losing the change type id", async () => {
    const formData = buildFormData();
    formData.append("active", "true");

    const result = await updateChangeTypeAdmin({}, formData);

    expect(result).toEqual({ message: "Change type opgeslagen." });
    expect(updateChangeTypeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        id: validId,
        slug: validSlug,
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
        slug: validSlug,
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

  it("passes all editable operational settings to the repository", async () => {
    const result = await updateChangeTypeAdmin(
      {},
      buildFormData({
        active: "true",
        baseCost: "750.50",
        perItemCost: "125.25",
        costCurrency: "usd",
        costDescription: "Nieuwe kostentekst voor benchmarkwissel",
        defaultLeadDays: "12",
        sortOrder: "1",
      }),
    );

    expect(result).toEqual({ message: "Change type opgeslagen." });
    expect(updateChangeTypeConfig).toHaveBeenCalledWith({
      id: validId,
      slug: validSlug,
      active: true,
      cost: {
        baseCost: 750.5,
        costCurrency: "USD",
        perItemCost: 125.25,
        description: "Nieuwe kostentekst voor benchmarkwissel",
      },
      defaultLeadDays: 12,
      sortOrder: 1,
    });
  });

  it("saves active toggle submissions with hidden false and checked true values", async () => {
    const formData = new FormData();
    formData.set("id", validId);
    formData.set("slug", validSlug);
    formData.append("active", "false");
    formData.append("active", "true");

    const result = await updateChangeTypeActiveAdmin({}, formData);

    expect(result).toEqual({ message: "Actief gemaakt." });
    expect(updateChangeTypeActive).toHaveBeenCalledWith({
      id: validId,
      slug: validSlug,
      active: true,
    });
  });

  it("saves disabled active toggle submissions as inactive", async () => {
    const formData = new FormData();
    formData.set("id", validId);
    formData.set("slug", validSlug);
    formData.set("active", "false");

    const result = await updateChangeTypeActiveAdmin({}, formData);

    expect(result).toEqual({ message: "Inactief gemaakt." });
    expect(updateChangeTypeActive).toHaveBeenCalledWith({
      id: validId,
      slug: validSlug,
      active: false,
    });
  });

  it("rejects anonymous invocation of updateChangeTypeAdmin without writing", async () => {
    mockIdentityRole = "change_manager";
    // No role cookie → getActiveRole resolves to the default (non-admin) profile.
    vi.mocked(cookies).mockResolvedValueOnce({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const result = await updateChangeTypeAdmin({}, buildFormData());

    expect(result.issues?.[0]).toMatch(/geautoriseerd/i);
    expect(updateChangeTypeConfig).not.toHaveBeenCalled();
  });

  it("rejects anonymous invocation of updateChangeTypeActiveAdmin without writing", async () => {
    mockIdentityRole = "change_manager";
    // No role cookie → getActiveRole resolves to the default (non-admin) profile.
    vi.mocked(cookies).mockResolvedValueOnce({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const formData = new FormData();
    formData.set("id", validId);
    formData.set("slug", validSlug);
    formData.append("active", "true");

    const result = await updateChangeTypeActiveAdmin({}, formData);

    expect(result.issues?.[0]).toMatch(/geautoriseerd/i);
    expect(updateChangeTypeActive).not.toHaveBeenCalled();
  });

  it("saves the full change type definition with validated JSON blocks", async () => {
    const result = await updateChangeTypeDefinitionAdmin({}, buildDefinitionFormData());

    expect(result).toEqual({ message: "Change proces opgeslagen." });
    expect(updateChangeTypeDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        id: validId,
        slug: validSlug,
        name: "Benchmarkwissel",
        workflow: "generic_field_change",
        fields: [
          expect.objectContaining({ key: "portfolio_id", type: "select" }),
        ],
        stakeholders: [
          expect.objectContaining({ id: "internal_admin", mandatory: true }),
        ],
        processFlow: [
          expect.objectContaining({ stepOrder: 1, action: "Aanvraag indienen" }),
        ],
      }),
    );
  });

  it("rejects invalid definition JSON without writing", async () => {
    const result = await updateChangeTypeDefinitionAdmin(
      {},
      buildDefinitionFormData({ fieldsJson: "{not-json" }),
    );

    expect(result.issues?.[0]).toMatch(/Velden bevat ongeldige JSON/);
    expect(updateChangeTypeDefinition).not.toHaveBeenCalled();
  });

  it("rejects anonymous full definition updates without writing", async () => {
    mockIdentityRole = "change_manager";
    // No role cookie → getActiveRole resolves to the default (non-admin) profile.
    vi.mocked(cookies).mockResolvedValueOnce({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const result = await updateChangeTypeDefinitionAdmin({}, buildDefinitionFormData());

    expect(result.issues?.[0]).toMatch(/geautoriseerd/i);
    expect(updateChangeTypeDefinition).not.toHaveBeenCalled();
  });
});
