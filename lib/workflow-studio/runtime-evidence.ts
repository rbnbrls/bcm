import { randomUUID } from "node:crypto";

import type { IdentityContext } from "@/lib/identity/types";
import { authorizeWorkflowAction, authorizeWorkflowPermission, type WorkflowDataScope } from "@/lib/workflow-studio-authorization";
import type { WorkflowRuntimeActor } from "@/lib/workflow-studio/runtime-state-machine";

export type WorkflowEvidenceThreadKind = "instance" | "task";
export type WorkflowEvidenceClassification = "internal" | "confidential" | "restricted";
export type WorkflowEvidenceScanStatus = "pending_scan" | "clean" | "quarantined" | "deleted";

export type WorkflowEvidenceAccessContext = WorkflowDataScope & Readonly<{
  instanceId: string;
  taskId?: string;
  permittedGroups: readonly string[];
  permission: "workflow:tasks:execute" | "workflow:approve";
}>;

export type WorkflowEvidenceCommentRecord = Readonly<{
  id: string;
  instanceId: string;
  threadKind: WorkflowEvidenceThreadKind;
  taskId?: string;
  body: string;
  classification: WorkflowEvidenceClassification;
  authorUserId: string;
  createdAt: string;
  correlationId: string;
}>;

export type WorkflowEvidenceAttachmentRecord = Readonly<{
  id: string;
  instanceId: string;
  threadKind: WorkflowEvidenceThreadKind;
  taskId?: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  classification: WorkflowEvidenceClassification;
  objectKey: string;
  checksumSha256: string;
  scanStatus: WorkflowEvidenceScanStatus;
  retentionUntil: string;
  uploadedByUserId: string;
  createdAt: string;
  updatedAt: string;
  correlationId: string;
}>;

export type WorkflowEvidenceDownloadGrant = Readonly<{
  attachmentId: string;
  objectKey: string;
  url: string;
  expiresAt: string;
}>;

export interface WorkflowEvidenceMetadataStore {
  writeComment(input: Omit<WorkflowEvidenceCommentRecord, "id"> & { id?: string }): Promise<WorkflowEvidenceCommentRecord>;
  writeAttachment(input: Omit<WorkflowEvidenceAttachmentRecord, "id" | "scanStatus" | "createdAt" | "updatedAt"> & { id?: string; createdAt: string }): Promise<WorkflowEvidenceAttachmentRecord>;
  updateAttachmentScan(input: Readonly<{ attachmentId: string; scanStatus: WorkflowEvidenceScanStatus; updatedAt: string }>): Promise<WorkflowEvidenceAttachmentRecord | null>;
  loadAttachment(attachmentId: string): Promise<WorkflowEvidenceAttachmentRecord | null>;
  listThread(input: Readonly<{ instanceId: string; threadKind: WorkflowEvidenceThreadKind; taskId?: string }>): Promise<readonly (WorkflowEvidenceCommentRecord | WorkflowEvidenceAttachmentRecord)[]>;
}

export interface WorkflowEvidenceObjectStore {
  createUploadObjectKey(input: Readonly<{ instanceId: string; threadKind: WorkflowEvidenceThreadKind; taskId?: string; attachmentId: string; fileName: string }>): string;
  createDownloadUrl(input: Readonly<{ objectKey: string; expiresAt: string }>): Promise<string>;
}

export type WorkflowEvidenceServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "permission_denied" | "scope_denied" | "invalid_attachment" | "scan_not_clean" | "retention_expired" | "not_found"; message: string };

function ok<T>(value: T): WorkflowEvidenceServiceResult<T> {
  return { ok: true, value };
}

function fail<T>(code: Exclude<WorkflowEvidenceServiceResult<T>, { ok: true }>["code"], message: string): WorkflowEvidenceServiceResult<T> {
  return { ok: false, code, message };
}

function actorFromIdentity(identity: IdentityContext): WorkflowRuntimeActor {
  return {
    type: "user",
    id: identity.userId,
    ...(identity.sessionId ? { sessionId: identity.sessionId } : {}),
  };
}

function authorizeEvidence(identity: IdentityContext, context: WorkflowEvidenceAccessContext): WorkflowEvidenceServiceResult<WorkflowRuntimeActor> {
  const permission = authorizeWorkflowPermission(identity, context.permission);
  if (!permission.authorized) return fail("permission_denied", permission.message);
  if (!context.permittedGroups.some((group) => identity.groups.includes(group))) {
    return fail("permission_denied", "De gebruiker heeft geen toegang tot deze workflowthread.");
  }
  const scope = authorizeWorkflowAction(identity, context.permission, {
    tenant: context.tenant,
    businessUnit: context.businessUnit,
    ...(context.clientIds ? { clientIds: context.clientIds } : {}),
  });
  return scope.authorized ? ok(actorFromIdentity(identity)) : fail("scope_denied", scope.message);
}

function threadKindFor(context: WorkflowEvidenceAccessContext): WorkflowEvidenceThreadKind {
  return context.taskId ? "task" : "instance";
}

function retentionUntil(createdAt: string, retentionDays: number): string {
  return new Date(Date.parse(createdAt) + retentionDays * 86_400_000).toISOString();
}

function validSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

export class WorkflowEvidenceService {
  constructor(
    private readonly metadata: WorkflowEvidenceMetadataStore,
    private readonly objects: WorkflowEvidenceObjectStore,
    private readonly options: Readonly<{ retentionDays?: number; downloadTtlMinutes?: number }> = {},
  ) {}

  async addComment(identity: IdentityContext, context: WorkflowEvidenceAccessContext, input: Readonly<{
    body: string;
    classification: WorkflowEvidenceClassification;
    correlationId: string;
    occurredAt: string;
  }>): Promise<WorkflowEvidenceServiceResult<WorkflowEvidenceCommentRecord>> {
    const access = authorizeEvidence(identity, context);
    if (!access.ok) return access;
    const body = input.body.trim();
    if (!body) return fail("invalid_attachment", "Commentaar mag niet leeg zijn.");
    return ok(await this.metadata.writeComment({
      instanceId: context.instanceId,
      threadKind: threadKindFor(context),
      ...(context.taskId ? { taskId: context.taskId } : {}),
      body,
      classification: input.classification,
      authorUserId: identity.userId,
      createdAt: input.occurredAt,
      correlationId: input.correlationId,
    }));
  }

  async registerAttachment(identity: IdentityContext, context: WorkflowEvidenceAccessContext, input: Readonly<{
    fileName: string;
    contentType: string;
    byteSize: number;
    checksumSha256: string;
    classification: WorkflowEvidenceClassification;
    correlationId: string;
    occurredAt: string;
  }>): Promise<WorkflowEvidenceServiceResult<WorkflowEvidenceAttachmentRecord>> {
    const access = authorizeEvidence(identity, context);
    if (!access.ok) return access;
    if (!input.fileName.trim() || !input.contentType.trim() || !Number.isInteger(input.byteSize) || input.byteSize <= 0 || !validSha256(input.checksumSha256)) {
      return fail("invalid_attachment", "Bijlage metadata is ongeldig.");
    }
    const id = randomUUID();
    const threadKind = threadKindFor(context);
    const objectKey = this.objects.createUploadObjectKey({
      instanceId: context.instanceId,
      threadKind,
      ...(context.taskId ? { taskId: context.taskId } : {}),
      attachmentId: id,
      fileName: input.fileName,
    });
    return ok(await this.metadata.writeAttachment({
      id,
      instanceId: context.instanceId,
      threadKind,
      ...(context.taskId ? { taskId: context.taskId } : {}),
      fileName: input.fileName,
      contentType: input.contentType,
      byteSize: input.byteSize,
      classification: input.classification,
      objectKey,
      checksumSha256: input.checksumSha256,
      retentionUntil: retentionUntil(input.occurredAt, this.options.retentionDays ?? 365),
      uploadedByUserId: identity.userId,
      createdAt: input.occurredAt,
      correlationId: input.correlationId,
    }));
  }

  async markScanResult(input: Readonly<{ attachmentId: string; scanStatus: Exclude<WorkflowEvidenceScanStatus, "pending_scan">; occurredAt: string }>): Promise<WorkflowEvidenceServiceResult<WorkflowEvidenceAttachmentRecord>> {
    const updated = await this.metadata.updateAttachmentScan({ attachmentId: input.attachmentId, scanStatus: input.scanStatus, updatedAt: input.occurredAt });
    return updated ? ok(updated) : fail("not_found", "Bijlage bestaat niet.");
  }

  async createDownloadLink(identity: IdentityContext, context: WorkflowEvidenceAccessContext, input: Readonly<{
    attachmentId: string;
    now: string;
  }>): Promise<WorkflowEvidenceServiceResult<WorkflowEvidenceDownloadGrant>> {
    const access = authorizeEvidence(identity, context);
    if (!access.ok) return access;
    const attachment = await this.metadata.loadAttachment(input.attachmentId);
    if (!attachment || attachment.instanceId !== context.instanceId || attachment.taskId !== context.taskId) return fail("not_found", "Bijlage bestaat niet.");
    if (attachment.scanStatus !== "clean") return fail("scan_not_clean", "Bijlage is nog niet schoon gescand.");
    if (Date.parse(attachment.retentionUntil) <= Date.parse(input.now)) return fail("retention_expired", "De retentieperiode van deze bijlage is verlopen.");
    const expiresAt = new Date(Date.parse(input.now) + (this.options.downloadTtlMinutes ?? 15) * 60_000).toISOString();
    return ok({
      attachmentId: attachment.id,
      objectKey: attachment.objectKey,
      url: await this.objects.createDownloadUrl({ objectKey: attachment.objectKey, expiresAt }),
      expiresAt,
    });
  }
}
