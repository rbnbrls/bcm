import { describe, expect, it } from "vitest";

import type { IdentityContext } from "@/lib/identity/types";
import {
  WorkflowEvidenceService,
  type WorkflowEvidenceAttachmentRecord,
  type WorkflowEvidenceCommentRecord,
  type WorkflowEvidenceMetadataStore,
  type WorkflowEvidenceObjectStore,
  type WorkflowEvidenceScanStatus,
} from "@/lib/workflow-studio";

function clone<T>(value: T): T {
  return structuredClone(value);
}

const identity = (overrides: Partial<IdentityContext> = {}): IdentityContext => ({
  userId: "user-1",
  displayName: "User One",
  groups: ["bcm:role:account_manager"],
  tenant: "tenant-a",
  businessUnit: "bu-a",
  sessionId: "session-1",
  ...overrides,
});

const access = {
  instanceId: "instance-1",
  taskId: "task-1",
  tenant: "tenant-a",
  businessUnit: "bu-a",
  permittedGroups: ["bcm:role:account_manager"],
  permission: "workflow:approve" as const,
};

class EvidenceMemoryStore implements WorkflowEvidenceMetadataStore {
  comments = new Map<string, WorkflowEvidenceCommentRecord>();
  attachments = new Map<string, WorkflowEvidenceAttachmentRecord>();

  async writeComment(input: Omit<WorkflowEvidenceCommentRecord, "id"> & { id?: string }) {
    const comment = { ...input, id: input.id ?? `comment-${this.comments.size + 1}` };
    this.comments.set(comment.id, clone(comment));
    return clone(comment);
  }

  async writeAttachment(input: Omit<WorkflowEvidenceAttachmentRecord, "id" | "scanStatus" | "createdAt" | "updatedAt"> & { id?: string; createdAt: string }) {
    const attachment: WorkflowEvidenceAttachmentRecord = {
      ...input,
      id: input.id ?? `attachment-${this.attachments.size + 1}`,
      scanStatus: "pending_scan",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.attachments.set(attachment.id, clone(attachment));
    return clone(attachment);
  }

  async updateAttachmentScan(input: { attachmentId: string; scanStatus: WorkflowEvidenceScanStatus; updatedAt: string }) {
    const current = this.attachments.get(input.attachmentId);
    if (!current) return null;
    const updated = { ...current, scanStatus: input.scanStatus, updatedAt: input.updatedAt };
    this.attachments.set(updated.id, clone(updated));
    return clone(updated);
  }

  async loadAttachment(attachmentId: string) {
    return clone(this.attachments.get(attachmentId) ?? null);
  }

  async listThread(input: { instanceId: string; threadKind: "instance" | "task"; taskId?: string }) {
    return clone([
      ...this.comments.values(),
      ...this.attachments.values(),
    ].filter((item) => (
      item.instanceId === input.instanceId
      && item.threadKind === input.threadKind
      && item.taskId === input.taskId
    )));
  }
}

class EvidenceObjectStore implements WorkflowEvidenceObjectStore {
  createUploadObjectKey(input: { instanceId: string; threadKind: "instance" | "task"; taskId?: string; attachmentId: string; fileName: string }) {
    return `workflow-evidence/${input.instanceId}/${input.threadKind}/${input.taskId ?? "instance"}/${input.attachmentId}/${encodeURIComponent(input.fileName)}`;
  }

  async createDownloadUrl(input: { objectKey: string; expiresAt: string }) {
    return `https://objects.example.test/${encodeURIComponent(input.objectKey)}?expires=${encodeURIComponent(input.expiresAt)}`;
  }
}

describe("workflow runtime evidence", () => {
  it("creates task comments in the authorized thread", async () => {
    const store = new EvidenceMemoryStore();
    const result = await new WorkflowEvidenceService(store, new EvidenceObjectStore()).addComment(identity(), access, {
      body: "  Controlebewijs akkoord.  ",
      classification: "confidential",
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T10:00:00.000Z",
    });

    expect(result).toMatchObject({ ok: true, value: { threadKind: "task", taskId: "task-1", body: "Controlebewijs akkoord.", authorUserId: "user-1" } });
    await expect(store.listThread({ instanceId: "instance-1", threadKind: "task", taskId: "task-1" })).resolves.toHaveLength(1);
  });

  it("registers attachment metadata without storing file bytes", async () => {
    const store = new EvidenceMemoryStore();
    const result = await new WorkflowEvidenceService(store, new EvidenceObjectStore(), { retentionDays: 30 }).registerAttachment(identity(), access, {
      fileName: "bewijs.pdf",
      contentType: "application/pdf",
      byteSize: 42_000,
      checksumSha256: "a".repeat(64),
      classification: "restricted",
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T10:00:00.000Z",
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        scanStatus: "pending_scan",
        objectKey: expect.stringContaining("/bewijs.pdf"),
        retentionUntil: "2026-09-10T10:00:00.000Z",
      },
    });
    expect(result.ok && result.value).not.toHaveProperty("bytes");
    expect(result.ok && result.value).not.toHaveProperty("content");
  });

  it("only grants temporary downloads after a clean scan and authorization", async () => {
    const store = new EvidenceMemoryStore();
    const service = new WorkflowEvidenceService(store, new EvidenceObjectStore(), { downloadTtlMinutes: 10 });
    const registered = await service.registerAttachment(identity(), access, {
      fileName: "bewijs.pdf",
      contentType: "application/pdf",
      byteSize: 42_000,
      checksumSha256: "b".repeat(64),
      classification: "confidential",
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T10:00:00.000Z",
    });
    if (!registered.ok) throw new Error(registered.message);

    await expect(service.createDownloadLink(identity(), access, {
      attachmentId: registered.value.id,
      now: "2026-08-11T10:05:00.000Z",
    })).resolves.toMatchObject({ ok: false, code: "scan_not_clean" });

    await service.markScanResult({ attachmentId: registered.value.id, scanStatus: "clean", occurredAt: "2026-08-11T10:06:00.000Z" });
    await expect(service.createDownloadLink(identity(), access, {
      attachmentId: registered.value.id,
      now: "2026-08-11T10:07:00.000Z",
    })).resolves.toMatchObject({
      ok: true,
      value: {
        attachmentId: registered.value.id,
        objectKey: registered.value.objectKey,
        expiresAt: "2026-08-11T10:17:00.000Z",
        url: expect.stringContaining("https://objects.example.test/"),
      },
    });
  });

  it("denies downloads for users outside the task thread groups", async () => {
    const store = new EvidenceMemoryStore();
    const service = new WorkflowEvidenceService(store, new EvidenceObjectStore());
    const registered = await service.registerAttachment(identity(), access, {
      fileName: "bewijs.pdf",
      contentType: "application/pdf",
      byteSize: 42_000,
      checksumSha256: "c".repeat(64),
      classification: "internal",
      correlationId: "correlation-1",
      occurredAt: "2026-08-11T10:00:00.000Z",
    });
    if (!registered.ok) throw new Error(registered.message);
    await service.markScanResult({ attachmentId: registered.value.id, scanStatus: "clean", occurredAt: "2026-08-11T10:01:00.000Z" });

    const result = await service.createDownloadLink(identity({ groups: ["bcm:role:operations"] }), access, {
      attachmentId: registered.value.id,
      now: "2026-08-11T10:02:00.000Z",
    });

    expect(result).toMatchObject({ ok: false, code: "permission_denied" });
  });
});
