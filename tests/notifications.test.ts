/**
 * Tests for the notification engine (lib/notifications.ts).
 *
 * Covers payload building, webhook delivery, email delivery,
 * config resolution, and the main sendChangeNotifications function.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ChangeRequest } from "@/lib/types";

const MOCK_CHANGE: ChangeRequest = {
  id: "6a1f8e7b-3c4d-5e6f-7a8b-9c0d1e2f3a4b",
  reference: "BCM-2026-001",
  clientName: "Pensioenfonds Horizon",
  clientReference: "PF-HOR-001",
  clientId: "9f9280fc-9572-49d1-b81c-2a039652bc93",
  requestedBy: "Jan Jansen",
  rationale: "Wijziging van benchmark voor betere spreiding",
  effectiveDate: "2026-09-01",
  changeType: "benchmark_switch",
  status: "submitted",
  createdAt: "2026-07-20T10:00:00Z",
  submittedAt: "2026-07-20T10:00:00Z",
  slaLeadWeeks: 1,
  daysOpen: 5,
  slaStatus: "ok",
  statusUpdatedAt: "2026-07-20T10:00:00Z",
  processedAt: null,
  processedBy: null,
  validatedAt: null,
  validatedBy: null,
  notificationSent: false,
  items: [
    {
      portfolioName: "Rendementsportefeuille",
      portfolioReference: "HOR-RP",
      previousBenchmark: {
        id: "9fb65c5a-5ccf-4374-a264-9b03c9ac3bd1",
        code: "MSCI-WORLD-NR",
        name: "MSCI World Net Return",
        assetClass: "Aandelen",
        currency: "EUR",
        cost: 1000,
        provider: "MSCI",
      },
      requestedBenchmark: {
        id: "b9ec8da5-5d7a-4ee0-a23e-9746ded5b43d",
        code: "MSCI-ACWI-NR",
        name: "MSCI ACWI Net Return",
        assetClass: "Aandelen",
        currency: "EUR",
        cost: 1200,
        provider: "MSCI",
      },
    },
  ],
};

// ── Payload builder ─────────────────────────────────────────────────────────

describe("buildNotificationPayload", () => {
  it("should build a valid notification payload from a change request", async () => {
    const { buildNotificationPayload } = await import("@/lib/notifications");
    const payload = buildNotificationPayload(MOCK_CHANGE, "Eigen administratie", "https://bcm.example.com");

    expect(payload.type).toBe("change_request_submitted");
    expect(payload.reference).toBe("BCM-2026-001");
    expect(payload.clientName).toBe("Pensioenfonds Horizon");
    expect(payload.changeType).toBe("benchmark_switch");
    expect(payload.effectiveDate).toBe("2026-09-01");
    expect(payload.requestedBy).toBe("Jan Jansen");
    expect(payload.rationale).toBe("Wijziging van benchmark voor betere spreiding");
    expect(payload.stakeholder).toBe("Eigen administratie");
    expect(payload.url).toContain("/changes/6a1f8e7b");

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].portfolioName).toBe("Rendementsportefeuille");
    expect(payload.items[0].previousBenchmark).toContain("MSCI-WORLD-NR");
    expect(payload.items[0].requestedBenchmark).toContain("MSCI-ACWI-NR");
  });

  it("should use BASE_URL env var when available", async () => {
    vi.stubEnv("BASE_URL", "https://custom.example.com");
    const { buildNotificationPayload } = await import("@/lib/notifications");
    const payload = buildNotificationPayload(MOCK_CHANGE, "FactSet");
    expect(payload.url).toContain("custom.example.com");
    vi.unstubAllEnvs();
  });
});

// ── Webhook delivery ────────────────────────────────────────────────────────

describe("deliverWebhook", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should return success on 200 response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("OK"),
    });

    const { deliverWebhook, buildNotificationPayload } = await import("@/lib/notifications");
    const payload = buildNotificationPayload(MOCK_CHANGE, "Eigen administratie");
    const result = await deliverWebhook("https://hook.example.com/notify", payload);

    expect(result.success).toBe(true);
    expect(result.channel).toBe("webhook");
    expect(result.recipient).toBe("https://hook.example.com/notify");
    expect(result.stakeholder).toBe("Eigen administratie");
    expect(result.statusCode).toBe(200);
  });

  it("should return failure on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Server Error"),
    });

    const { deliverWebhook, buildNotificationPayload } = await import("@/lib/notifications");
    const payload = buildNotificationPayload(MOCK_CHANGE, "Eigen administratie");
    const result = await deliverWebhook("https://hook.example.com/notify", payload);

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.response).toContain("500");
  });

  it("should return failure on network error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const { deliverWebhook, buildNotificationPayload } = await import("@/lib/notifications");
    const payload = buildNotificationPayload(MOCK_CHANGE, "Eigen administratie");
    const result = await deliverWebhook("https://hook.example.com/notify", payload);

    expect(result.success).toBe(false);
    expect(result.error).toBe("ECONNREFUSED");
  });
});

// ── Email delivery ──────────────────────────────────────────────────────────

describe("deliverEmail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("should fail gracefully when SMTP is not configured", async () => {
    const { deliverEmail, buildNotificationPayload } = await import("@/lib/notifications");
    const payload = buildNotificationPayload(MOCK_CHANGE, "Eigen administratie");
    const result = await deliverEmail("admin@example.com", payload);

    expect(result.success).toBe(false);
    expect(result.error).toContain("SMTP niet geconfigureerd");
  });
});

// ── Config resolution ───────────────────────────────────────────────────────

describe("resolveConfig", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("should return configs from env vars when DB is not available", async () => {
    vi.stubEnv("WEBHOOK_ADMINISTRATIE", "https://hook.admin.example.com");
    vi.stubEnv("WEBHOOK_ASSET_SERVICE", "https://hook.asp.example.com");
    vi.stubEnv("WEBHOOK_FACTSET", "https://hook.factset.example.com");

    // Mock DB to return empty
    vi.doMock("@/lib/db", () => ({
      getNotificationConfigsBatch: vi.fn().mockResolvedValue([]),
    }));

    const { resolveConfig } = await import("@/lib/notifications");
    const configs = await resolveConfig();

    expect(configs).toHaveLength(3);
    const admin = configs.find((c) => c.stakeholderId === "eigen_administratie");
    expect(admin?.webhookUrl).toBe("https://hook.admin.example.com");
    expect(admin?.emailAddress).toBeUndefined();

    const factset = configs.find((c) => c.stakeholderId === "factset");
    expect(factset?.webhookUrl).toBe("https://hook.factset.example.com");
  });

  it("should fall back to email env vars when no webhook is configured", async () => {
    vi.stubEnv("NOTIFY_EMAIL_ADMINISTRATIE", "admin@example.com");
    vi.stubEnv("NOTIFY_EMAIL_FACTSET", "factset@example.com");

    vi.doMock("@/lib/db", () => ({
      getNotificationConfigsBatch: vi.fn().mockResolvedValue([]),
    }));

    const { resolveConfig } = await import("@/lib/notifications");
    const configs = await resolveConfig();

    const admin = configs.find((c) => c.stakeholderId === "eigen_administratie");
    expect(admin?.emailAddress).toBe("admin@example.com");

    const asp = configs.find((c) => c.stakeholderId === "asset_service_provider");
    expect(asp?.webhookUrl).toBeUndefined();
    expect(asp?.emailAddress).toBeUndefined();
  });
});

// ── Main sendChangeNotifications ────────────────────────────────────────────

describe("sendChangeNotifications", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("should return results for all stakeholders", async () => {
    vi.stubEnv("WEBHOOK_ADMINISTRATIE", "https://hook.admin.example.com");
    vi.stubEnv("NOTIFY_EMAIL_ASSET_SERVICE", "asp@example.com");

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("OK"),
    });

    vi.doMock("@/lib/db", () => ({
      getNotificationConfigsBatch: vi.fn().mockResolvedValue([]),
      logNotificationDelivery: vi.fn().mockResolvedValue(undefined),
      updateNotificationSent: vi.fn().mockResolvedValue(undefined),
    }));

    const { sendChangeNotifications } = await import("@/lib/notifications");
    const results = await sendChangeNotifications(MOCK_CHANGE);

    // Should have at least the configured ones
    const adminResult = results.find((r) => r.stakeholder === "Eigen administratie");
    expect(adminResult).toBeDefined();
    expect(adminResult?.success).toBe(true);

    // Asset service provider should have email result
    const aspResult = results.find((r) => r.stakeholder === "Asset service provider");
    expect(aspResult).toBeDefined();

    // FactSet has no config - should report failure
    const factsetResult = results.find((r) => r.stakeholder === "FactSet");
    expect(factsetResult).toBeDefined();
  });
});
