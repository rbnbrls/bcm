import type { IdentityContext } from "@/lib/identity/types";
import type { WorkflowEngineEvent } from "@/lib/workflow-studio/runtime-engine";

export type WorkflowSecurityHeader = Readonly<{ name: string; value: string }>;

export type WorkflowRateLimitDecision =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; remaining: 0; resetAt: number; retryAfterSeconds: number };

export type WorkflowRateLimitBucket = Readonly<{
  key: string;
  limit: number;
  windowMs: number;
}>;

export type WorkflowSecuritySiemEvent = Readonly<{
  schemaVersion: 1;
  eventType: string;
  occurredAt: string;
  workflowInstanceRef: string;
  workflowNodeRef?: string;
  actorRef: string;
  correlationId: string;
  classification: "internal" | "confidential" | "restricted";
  payloadKeys: readonly string[];
}>;

const DEFAULT_WINDOW_MS = 60_000;

const SECURITY_HEADERS: readonly WorkflowSecurityHeader[] = Object.freeze([
  { name: "X-Content-Type-Options", value: "nosniff" },
  { name: "X-Frame-Options", value: "DENY" },
  { name: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { name: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { name: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { name: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    name: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' https://api.github.com",
      "upgrade-insecure-requests",
    ].join("; "),
  },
]);

function stableRef(value: string, salt: string): string {
  let hash = 2166136261;
  const input = `${salt}:${value}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `wf_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("x-real-ip")
    || "unknown";
}

export function workflowSecurityHeaders(): readonly WorkflowSecurityHeader[] {
  return SECURITY_HEADERS;
}

export function applyWorkflowSecurityHeaders(headers: Headers): Headers {
  for (const header of SECURITY_HEADERS) headers.set(header.name, header.value);
  return headers;
}

export function workflowRouteRateLimitBucket(input: Readonly<{
  pathname: string;
  method: string;
  identity: IdentityContext;
  headers: Headers;
}>): WorkflowRateLimitBucket | null {
  const method = input.method.toUpperCase();
  const subject = input.identity.sessionId || input.identity.userId || clientIp(input.headers);
  if (input.pathname.startsWith("/workflow-runtime/") && method === "POST") {
    return { key: `runtime-write:${subject}`, limit: 30, windowMs: DEFAULT_WINDOW_MS };
  }
  if (/^\/workflow-runtime\/[^/]+\/start\/?$/.test(input.pathname)) {
    return { key: `runtime-start:${subject}`, limit: 40, windowMs: DEFAULT_WINDOW_MS };
  }
  if (input.pathname.startsWith("/workflow-studio/") && method !== "GET") {
    return { key: `studio-write:${subject}`, limit: 90, windowMs: DEFAULT_WINDOW_MS };
  }
  if (input.pathname === "/tasks" || input.pathname.startsWith("/tasks/")) {
    return { key: `tasks:${subject}`, limit: 120, windowMs: DEFAULT_WINDOW_MS };
  }
  if (input.pathname.startsWith("/admin")) {
    return { key: `admin:${subject}`, limit: 60, windowMs: DEFAULT_WINDOW_MS };
  }
  if (input.pathname === "/workflow-runtime" || input.pathname.startsWith("/workflow-runtime/")) {
    return { key: `runtime-read:${subject}`, limit: 180, windowMs: DEFAULT_WINDOW_MS };
  }
  if (input.pathname === "/workflow-studio" || input.pathname.startsWith("/workflow-studio/")) {
    return { key: `studio-read:${subject}`, limit: 180, windowMs: DEFAULT_WINDOW_MS };
  }
  return null;
}

export class WorkflowRouteRateLimiter {
  readonly #buckets = new Map<string, { count: number; resetAt: number }>();

  check(bucket: WorkflowRateLimitBucket, now = Date.now()): WorkflowRateLimitDecision {
    const current = this.#buckets.get(bucket.key);
    if (!current || current.resetAt <= now) {
      const resetAt = now + bucket.windowMs;
      this.#buckets.set(bucket.key, { count: 1, resetAt });
      return { allowed: true, remaining: bucket.limit - 1, resetAt };
    }
    if (current.count >= bucket.limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: current.resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      };
    }
    current.count += 1;
    return { allowed: true, remaining: bucket.limit - current.count, resetAt: current.resetAt };
  }

  reset(): void {
    this.#buckets.clear();
  }
}

export function workflowSecuritySiemEvent(
  event: WorkflowEngineEvent,
  input: Readonly<{ salt: string; classification?: WorkflowSecuritySiemEvent["classification"] }>,
): WorkflowSecuritySiemEvent {
  return Object.freeze({
    schemaVersion: 1,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    workflowInstanceRef: stableRef(event.instanceId, input.salt),
    ...(event.nodeInstanceId ? { workflowNodeRef: stableRef(event.nodeInstanceId, input.salt) } : {}),
    actorRef: stableRef(`${event.actor.type}:${event.actor.id}`, input.salt),
    correlationId: event.correlationId,
    classification: input.classification ?? "confidential",
    payloadKeys: Object.freeze(Object.keys(event.payload).sort()),
  });
}
