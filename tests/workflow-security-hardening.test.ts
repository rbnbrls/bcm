import { describe, expect, it } from "vitest";

import type { IdentityContext } from "@/lib/identity/types";
import {
  WorkflowRouteRateLimiter,
  applyWorkflowSecurityHeaders,
  workflowRouteRateLimitBucket,
  workflowSecurityHeaders,
  workflowSecuritySiemEvent,
  type WorkflowEngineEvent,
} from "@/lib/workflow-studio";

const identity = (overrides: Partial<IdentityContext> = {}): IdentityContext => ({
  userId: "user-1",
  displayName: "User One",
  groups: ["bcm:role:change_manager"],
  tenant: "tenant-a",
  businessUnit: "bu-a",
  sessionId: "session-1",
  ...overrides,
});

const event = (overrides: Partial<WorkflowEngineEvent> = {}): WorkflowEngineEvent => ({
  id: "event-1",
  instanceId: "instance-secret-1",
  nodeInstanceId: "node-secret-1",
  eventType: "workflow.change_intent.created",
  eventVersion: 1,
  payload: {
    payload: { newBenchmarkValue: "SECRET-BENCHMARK" },
    secretRef: "secret:slack.bot_token",
    adapterId: "portfolio-config-adapter",
  },
  actor: { type: "user", id: "manager-1", sessionId: "session-secret" },
  idempotencyKey: "command-1",
  correlationId: "correlation-1",
  occurredAt: "2026-08-11T10:00:00.000Z",
  ...overrides,
});

describe("workflow security hardening", () => {
  it("sets CSP and browser hardening headers on protected responses", () => {
    const headers = applyWorkflowSecurityHeaders(new Headers());

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(workflowSecurityHeaders().map((header) => header.name)).toContain("Content-Security-Policy");
  });

  it("derives rate-limit buckets from route, method and signed session", () => {
    const bucket = workflowRouteRateLimitBucket({
      pathname: "/workflow-runtime/version-1/start",
      method: "POST",
      identity: identity(),
      headers: new Headers({ "x-forwarded-for": "198.51.100.10" }),
    });

    expect(bucket).toEqual({
      key: "runtime-write:session-1",
      limit: 30,
      windowMs: 60_000,
    });
  });

  it("blocks requests after the bucket limit until the window resets", () => {
    const limiter = new WorkflowRouteRateLimiter();
    const bucket = { key: "studio-write:session-1", limit: 2, windowMs: 1_000 };

    expect(limiter.check(bucket, 1_000)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check(bucket, 1_100)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check(bucket, 1_200)).toMatchObject({ allowed: false, retryAfterSeconds: 1 });
    expect(limiter.check(bucket, 2_001)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("exports SIEM events with pseudonymous refs and payload keys only", () => {
    const exported = workflowSecuritySiemEvent(event(), { salt: "tenant-secret-salt", classification: "restricted" });
    const serialized = JSON.stringify(exported);

    expect(exported).toMatchObject({
      eventType: "workflow.change_intent.created",
      classification: "restricted",
      payloadKeys: ["adapterId", "payload", "secretRef"],
    });
    expect(exported.workflowInstanceRef).toMatch(/^wf_/);
    expect(exported.actorRef).toMatch(/^wf_/);
    expect(serialized).not.toContain("instance-secret-1");
    expect(serialized).not.toContain("node-secret-1");
    expect(serialized).not.toContain("manager-1");
    expect(serialized).not.toContain("SECRET-BENCHMARK");
    expect(serialized).not.toContain("secret:slack.bot_token");
  });
});
