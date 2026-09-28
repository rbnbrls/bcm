import { describe, expect, it } from "vitest";
import type { IdentityContext } from "@/lib/identity/types";
import {
  ClientConfigReadError,
  ClientConfigReadService,
  type ClientConfigReadSource,
  type ClientConfigSourceRecord,
} from "@/lib/workflow-studio/read-adapters";

function identity(groups = ["bcm:role:change_manager"]): IdentityContext {
  return {
    userId: "user-1",
    displayName: "Gebruiker",
    groups,
    tenant: "tenant-a",
    businessUnit: "investments",
    sessionId: "session-1",
  };
}

const scope = { tenant: "tenant-a", businessUnit: "investments", clientIds: ["HOR"] };

const records: Record<string, readonly ClientConfigSourceRecord[]> = {
  client: [
    { sourceRecordId: "HOR", values: { code: "HOR", name: "Horizon" }, scopeClientIds: ["HOR"] },
    { sourceRecordId: "ZEK", values: { code: "ZEK", name: "Zeker" }, scopeClientIds: ["ZEK"] },
  ],
  manager: [
    { sourceRecordId: "ROB", values: { code: "ROB", name: "Robeco" }, scopeClientIds: null },
    { sourceRecordId: "UBS", values: { code: "UBS", name: "UBS" }, scopeClientIds: null },
  ],
};

class FakeSource implements ClientConfigReadSource {
  constructor(private readonly data = records) {}
  async read(resourceId: string): Promise<readonly ClientConfigSourceRecord[]> {
    return this.data[resourceId] ?? [];
  }
}

const service = new ClientConfigReadService(new FakeSource());

describe("Workflow Studio client-config read adapters", () => {
  it("searches deterministically and only returns selected catalog fields", async () => {
    const result = await service.search({
      identity: identity(),
      scope,
      resourceId: "manager",
      query: "b",
      fields: ["code"],
    });

    expect(result).toHaveLength(2);
    expect(result.map((record) => record.sourceRecordId)).toEqual(["ROB", "UBS"]);
    expect(result[0].fields).toEqual({ code: "ROB" });
    expect(result[0].concurrencyToken).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("selects on validated exact catalog values", async () => {
    await expect(service.select({
      identity: identity(),
      scope,
      resourceId: "manager",
      filters: [{ attributeId: "code", value: "UBS" }],
    })).resolves.toMatchObject([{ sourceRecordId: "UBS" }]);

    await expect(service.select({
      identity: identity(),
      scope,
      resourceId: "manager",
      filters: [{ attributeId: "code", value: "invalid" }],
    })).rejects.toMatchObject({ code: "invalid_filter_value" });
  });

  it("filters client-owned records before search and get", async () => {
    await expect(service.search({ identity: identity(), scope, resourceId: "client" }))
      .resolves.toMatchObject([{ sourceRecordId: "HOR" }]);
    await expect(service.get({
      identity: identity(),
      scope,
      resourceId: "client",
      sourceRecordId: "ZEK",
    })).rejects.toMatchObject({ code: "source_record_not_found" });
  });

  it("fails closed for invalid identity and workflow scope", async () => {
    await expect(service.search({
      identity: identity([]),
      scope,
      resourceId: "manager",
    })).rejects.toMatchObject({ code: "read_not_authorized" });
    await expect(service.search({
      identity: identity(),
      scope: { ...scope, tenant: "tenant-b" },
      resourceId: "manager",
    })).rejects.toMatchObject({ code: "read_not_authorized" });
  });

  it("accepts only stable catalog resources and attributes", async () => {
    await expect(service.search({
      identity: identity(), scope, resourceId: "client_config.client",
    })).rejects.toMatchObject({ code: "unknown_read_resource" });
    await expect(service.search({
      identity: identity(), scope, resourceId: "client", fields: ["client_code"],
    })).rejects.toMatchObject({ code: "unknown_read_attribute" });
  });

  it("creates immutable, reproducible and auditable snapshots", async () => {
    const request = {
      identity: identity(),
      scope,
      resourceId: "client",
      sourceRecordId: "HOR",
      fields: ["code", "name"],
    } as const;
    const first = await service.snapshot(request, new Date("2026-08-06T10:00:00.000Z"));
    const second = await service.snapshot(request, new Date("2026-08-06T11:00:00.000Z"));

    expect(first).toEqual({
      snapshotVersion: 1,
      resourceId: "client",
      sourceRecordId: "HOR",
      selectedFields: { code: "HOR", name: "Horizon" },
      concurrencyToken: first.concurrencyToken,
      readAt: "2026-08-06T10:00:00.000Z",
    });
    expect(first.concurrencyToken).toBe(second.concurrencyToken);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.selectedFields)).toBe(true);
  });

  it("changes the concurrency token when any source value changes", async () => {
    const changed = new ClientConfigReadService(new FakeSource({
      ...records,
      client: [{ sourceRecordId: "HOR", values: { code: "HOR", name: "Nieuwe naam" }, scopeClientIds: ["HOR"] }],
    }));
    const request = { identity: identity(), scope, resourceId: "client", sourceRecordId: "HOR", fields: ["code"] };
    const originalSnapshot = await service.snapshot(request);
    const changedSnapshot = await changed.snapshot(request);
    expect(changedSnapshot.selectedFields).toEqual(originalSnapshot.selectedFields);
    expect(changedSnapshot.concurrencyToken).not.toBe(originalSnapshot.concurrencyToken);
  });

  it("rejects malformed source records instead of emitting invalid snapshots", async () => {
    const malformed = new ClientConfigReadService(new FakeSource({
      client: [{ sourceRecordId: "HOR", values: { code: "not valid", name: "Horizon" }, scopeClientIds: ["HOR"] }],
    }));
    await expect(malformed.get({
      identity: identity(), scope, resourceId: "client", sourceRecordId: "HOR",
    })).rejects.toBeInstanceOf(ClientConfigReadError);
    await expect(malformed.get({
      identity: identity(), scope, resourceId: "client", sourceRecordId: "HOR",
    })).rejects.toMatchObject({ code: "source_contract_violation" });
  });
});
