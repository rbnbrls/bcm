import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { IdentityContext } from "@/lib/identity/types";

export const IDENTITY_SESSION_COOKIE = "bcm_identity_session";
export const IDENTITY_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

type SessionPayload = IdentityContext & {
  issuedAt: number;
  expiresAt: number;
};

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sessionSecret(explicitSecret?: string): string | null {
  if (explicitSecret) return explicitSecret;
  if (process.env.BCM_SESSION_SECRET) return process.env.BCM_SESSION_SECRET;
  if (process.env.NODE_ENV === "production") return null;
  return "bcm-local-only-identity-secret";
}

function signature(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function isIdentity(value: unknown): value is IdentityContext {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<IdentityContext>;
  return typeof candidate.userId === "string"
    && candidate.userId.length > 0
    && typeof candidate.displayName === "string"
    && candidate.displayName.length > 0
    && Array.isArray(candidate.groups)
    && candidate.groups.every((group) => typeof group === "string")
    && (candidate.tenant === null || typeof candidate.tenant === "string")
    && (candidate.businessUnit === null || typeof candidate.businessUnit === "string")
    && typeof candidate.sessionId === "string"
    && candidate.sessionId.length > 0;
}

export function createIdentitySessionToken(
  identity: Omit<IdentityContext, "sessionId"> & { sessionId?: string },
  options: { secret?: string; now?: number; maxAgeSeconds?: number } = {},
): string {
  const secret = sessionSecret(options.secret);
  if (!secret) throw new Error("BCM_SESSION_SECRET is required to create identity sessions in production.");
  const now = options.now ?? Date.now();
  const payload: SessionPayload = {
    ...identity,
    sessionId: identity.sessionId ?? randomUUID(),
    issuedAt: now,
    expiresAt: now + (options.maxAgeSeconds ?? IDENTITY_SESSION_MAX_AGE_SECONDS) * 1000,
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${signature(encodedPayload, secret)}`;
}

export function verifyIdentitySessionToken(
  token: string | undefined,
  options: { secret?: string; now?: number } = {},
): IdentityContext | null {
  const secret = sessionSecret(options.secret);
  if (!token || !secret) return null;
  const [encodedPayload, suppliedSignature, extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra) return null;

  const expected = Buffer.from(signature(encodedPayload, secret));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
    if (!isIdentity(payload) || typeof payload.expiresAt !== "number") return null;
    if (payload.expiresAt <= (options.now ?? Date.now())) return null;
    return {
      userId: payload.userId,
      displayName: payload.displayName,
      groups: [...payload.groups],
      tenant: payload.tenant,
      businessUnit: payload.businessUnit,
      sessionId: payload.sessionId,
    };
  } catch {
    return null;
  }
}
