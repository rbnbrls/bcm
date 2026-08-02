/**
 * Tests for the four lifecycle change types in the change catalog.
 *
 * Covers:
 *  1. getChangeTypes() exposes all four lifecycle slugs (client_onboarding,
 *     portfolio_configuration_create/update/retire) in the catalog data,
 *     alongside the legacy portfolio_addition slug (backward compatibility).
 *  2. Each lifecycle type carries the correct Dutch labels and metadata:
 *     name, description, category, cost, defaultLeadDays, stakeholders,
 *     processFlow, active flag and sort order.
 *  3. The catalog API endpoint GET /api/change-types/[id]/flow serves the
 *     process flow for each of the four lifecycle slugs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_CHANGE_TYPE_CONFIGS, getChangeTypes } from "@/lib/db";

const LIFECYCLE_SLUGS = [
  "client_onboarding",
  "portfolio_configuration_create",
  "portfolio_configuration_update",
  "portfolio_configuration_retire",
] as const;

describe("change catalog exposes the four lifecycle change types", () => {
  it("includes all four lifecycle slugs in the default catalog", async () => {
    const types = await getChangeTypes();
    const slugs = types.map((t) => t.slug);
    for (const slug of LIFECYCLE_SLUGS) {
      expect(slugs).toContain(slug);
    }
  });

  it("keeps portfolio_addition in the catalog for backward compatibility", async () => {
    const types = await getChangeTypes();
    const slugs = types.map((t) => t.slug);
    expect(slugs).toContain("portfolio_addition");
  });

  it("marks all four lifecycle types as active", async () => {
    const types = await getChangeTypes();
    for (const slug of LIFECYCLE_SLUGS) {
      const config = types.find((t) => t.slug === slug);
      expect(config, `missing ${slug}`).toBeDefined();
      expect(config!.active, `${slug} should be active`).toBe(true);
    }
  });

  it("gives each lifecycle type a non-empty Dutch name and description", async () => {
    const types = await getChangeTypes();
    for (const slug of LIFECYCLE_SLUGS) {
      const config = types.find((t) => t.slug === slug)!;
      expect(config.name.length).toBeGreaterThan(0);
      expect(config.description.length).toBeGreaterThan(0);
    }
  });
});

describe("Dutch labels and metadata per lifecycle change type", () => {
  function configFor(slug: string) {
    const config = DEFAULT_CHANGE_TYPE_CONFIGS.find((c) => c.slug === slug);
    expect(config, `expected catalog config for ${slug}`).toBeDefined();
    return config!;
  }

  it("client_onboarding: Dutch client onboarding metadata", () => {
    const c = configFor("client_onboarding");
    expect(c.name).toBe("Nieuwe klant (client onboarding)");
    expect(c.description).toBe(
      "Onboard een nieuwe pensioenklant met eerste portfolio-configuratie"
    );
    expect(c.category).toBe("client");
    expect(c.active).toBe(true);
    expect(c.sortOrder).toBe(6);
    expect(c.cost).toMatchObject({ baseCost: 0, costCurrency: "EUR" });
    expect(c.defaultLeadDays).toBe(1);
    expect(c.workflow).toBe("client_onboarding");
    // 4-step process flow
    expect(c.processFlow).toHaveLength(4);
    expect(c.processFlow![0].action).toBe("Aanvraag indienen");
    expect(c.processFlow![3].action).toBe("Gereedmelding");
    // Stakeholders: internal admin + asset service provider
    const stakeholders = c.stakeholders.map((s) => s.id);
    expect(stakeholders).toContain("internal_admin");
    expect(stakeholders).toContain("asset_service");
  });

  it("portfolio_configuration_create: Dutch create metadata + create-wizard routing", () => {
    const c = configFor("portfolio_configuration_create");
    expect(c.name).toBe("Portefeuilleconfiguratie toevoegen");
    expect(c.description).toBe(
      "Voeg een nieuwe portefeuilleconfiguratie (rekeningregel) toe aan een bestaande cliënt"
    );
    expect(c.category).toBe("portfolio");
    expect(c.active).toBe(true);
    expect(c.sortOrder).toBe(8);
    expect(c.cost).toMatchObject({
      baseCost: 500,
      costCurrency: "EUR",
      description: "€500 vaste kost voor toevoegen van een portefeuilleconfiguratie",
    });
    expect(c.defaultLeadDays).toBe(5);
    expect(c.workflow).toBe("portfolio_configuration_create");
    // Field set reflects the account-line create wizard
    const fieldKeys = c.fields.map((f) => f.key);
    expect(fieldKeys).toEqual(
      expect.arrayContaining([
        "client_code",
        "portfolio_code",
        "asset_class_code",
        "sub_asset_class_code",
        "manager_code",
        "benchmark_code",
        "long_name",
        "short_name",
        "effective_from",
      ])
    );
    expect(c.processFlow).toHaveLength(4);
  });

  it("portfolio_configuration_update: Dutch update metadata (generic config-driven form)", () => {
    const c = configFor("portfolio_configuration_update");
    expect(c.name).toBe("Portefeuilleconfiguratie wijzigen");
    expect(c.description).toBe(
      "Wijzig attributen van een bestaande portefeuilleconfiguratie (benchmark, NPC, namen, datums)"
    );
    expect(c.category).toBe("portfolio");
    expect(c.active).toBe(true);
    expect(c.sortOrder).toBe(9);
    expect(c.cost).toMatchObject({
      baseCost: 250,
      costCurrency: "EUR",
      description: "€250 vaste kost voor het wijzigen van een portefeuilleconfiguratie",
    });
    expect(c.defaultLeadDays).toBe(5);
    expect(c.workflow).toBe("portfolio_configuration_update");
    // Update form fields: target identity + SOLL attributes
    const fieldKeys = c.fields.map((f) => f.key);
    expect(fieldKeys).toEqual(
      expect.arrayContaining([
        "target_primary_account_id",
        "benchmark_code",
        "npc_classification",
        "long_name",
        "short_name",
        "effective_date",
      ])
    );
    expect(c.processFlow).toHaveLength(4);
  });

  it("portfolio_configuration_retire: Dutch retire metadata (generic config-driven form)", () => {
    const c = configFor("portfolio_configuration_retire");
    expect(c.name).toBe("Portefeuilleconfiguratie beëindigen");
    expect(c.description).toBe(
      "Beëindig (retire) een bestaande portefeuilleconfiguratie"
    );
    expect(c.category).toBe("portfolio");
    expect(c.active).toBe(true);
    expect(c.sortOrder).toBe(10);
    expect(c.cost).toMatchObject({
      baseCost: 100,
      costCurrency: "EUR",
      description: "€100 vaste kost voor het beëindigen van een portefeuilleconfiguratie",
    });
    expect(c.defaultLeadDays).toBe(3);
    expect(c.workflow).toBe("portfolio_configuration_retire");
    // Retire form fields: target identity + end date + rationale
    const fieldKeys = c.fields.map((f) => f.key);
    expect(fieldKeys).toEqual(
      expect.arrayContaining([
        "target_primary_account_id",
        "effective_until",
        "rationale",
      ])
    );
    expect(c.processFlow).toHaveLength(4);
    expect(c.processFlow![2].action).toBe("Beëindigen configuratieregel");
  });

  it("portfolio_addition: legacy slug keeps its Dutch label and create metadata", () => {
    const c = configFor("portfolio_addition");
    expect(c.name).toBe("Nieuwe portfolio toevoegen");
    expect(c.category).toBe("portfolio");
    expect(c.active).toBe(true);
    expect(c.sortOrder).toBe(7);
    expect(c.cost).toMatchObject({ baseCost: 500, costCurrency: "EUR" });
    expect(c.workflow).toBe("portfolio_addition");
  });

  it("sorts lifecycle types relative to the legacy slug (7 < 8 < 9 < 10)", () => {
    const order = DEFAULT_CHANGE_TYPE_CONFIGS.map((c) => c.slug);
    expect(order.indexOf("portfolio_addition")).toBeLessThan(
      order.indexOf("portfolio_configuration_create")
    );
    expect(order.indexOf("portfolio_configuration_create")).toBeLessThan(
      order.indexOf("portfolio_configuration_update")
    );
    expect(order.indexOf("portfolio_configuration_update")).toBeLessThan(
      order.indexOf("portfolio_configuration_retire")
    );
  });
});

describe("GET /api/change-types/[id]/flow serves each lifecycle slug", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with a 4-step process flow for each lifecycle slug", async () => {
    const { GET } = await import("@/app/api/change-types/[id]/flow/route");
    for (const slug of LIFECYCLE_SLUGS) {
      const request = new Request(`http://localhost:3000/api/change-types/${slug}/flow`);
      const response = await GET(request, { params: Promise.resolve({ id: slug }) });
      expect(response.status, `status for ${slug}`).toBe(200);
      const body = await response.json();
      expect(body.changeType.slug).toBe(slug);
      expect(body.changeType.name.length).toBeGreaterThan(0);
      expect(body.flow).toHaveLength(4);
      expect(body.flow[0].stepOrder).toBe(1);
      expect(body.flow[3].stepOrder).toBe(4);
    }
  });

  it("returns 200 for the legacy portfolio_addition slug", async () => {
    const { GET } = await import("@/app/api/change-types/[id]/flow/route");
    const request = new Request("http://localhost:3000/api/change-types/portfolio_addition/flow");
    const response = await GET(request, {
      params: Promise.resolve({ id: "portfolio_addition" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.changeType.slug).toBe("portfolio_addition");
    expect(body.flow.length).toBeGreaterThan(0);
  });
});
