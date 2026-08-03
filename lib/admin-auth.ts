import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Admin-gate credentials for the /admin/* area.
 *
 * BCM has no user/role system; the admin surface is protected by an
 * HTTP Basic Auth gate (see proxy.ts) backed by the ADMIN_USER and
 * ADMIN_PASSWORD environment variables. This module holds the PURE
 * credential-checking logic, shared by:
 *
 *   - proxy.ts              — route-level gate: every /admin/* request
 *                             (pages AND server-action POSTs)
 *   - server actions        — defense in depth via requireAdmin()
 *                             (lib/admin-auth-request.ts), so a future
 *                             refactor can never expose a write action
 *                             that trusts only the route gate.
 *
 * It intentionally imports nothing from "next/*" so it can be bundled
 * into the proxy runtime as well as regular server-action modules.
 *
 * Security properties:
 *   - FAIL CLOSED: when ADMIN_USER / ADMIN_PASSWORD are not configured,
 *     every request is treated as unauthorized (there are no default or
 *     demo credentials).
 *   - Credentials are compared as SHA-256 digests with timingSafeEqual,
 *     so response-time differences do not leak the expected password
 *     length or contents.
 */

export const ADMIN_USER_ENV = "ADMIN_USER";
export const ADMIN_PASSWORD_ENV = "ADMIN_PASSWORD";

export const UNAUTHORIZED_MESSAGE = "Niet geautoriseerd. Log in als beheerder.";

/** True when both admin credentials are configured (fail-closed otherwise). */
export function adminConfigIsSet(): boolean {
  return Boolean(
    process.env[ADMIN_USER_ENV] && process.env[ADMIN_PASSWORD_ENV],
  );
}

/**
 * Constant-time equality for two strings (lengths never leak: both sides
 * are hashed to fixed-size digests before comparison).
 */
function safeEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}

/** Parse an "Authorization: Basic ..." header into user/password. */
export function parseBasicAuthorization(
  authorization: string | null,
): { user: string; password: string } | null {
  if (!authorization) return null;
  const [scheme, encoded] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return null;
  }
  const separator = decoded.indexOf(":");
  if (separator === -1) return null;
  return {
    user: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

/**
 * True when the request's Authorization header matches the configured
 * ADMIN_USER / ADMIN_PASSWORD. Returns false for missing configuration,
 * missing/malformed headers and wrong credentials.
 */
export function adminIsAuthorized(authorization: string | null): boolean {
  const expectedUser = process.env[ADMIN_USER_ENV];
  const expectedPassword = process.env[ADMIN_PASSWORD_ENV];
  if (!expectedUser || !expectedPassword) return false;

  const credentials = parseBasicAuthorization(authorization);
  if (!credentials) return false;

  return (
    safeEqual(credentials.user, expectedUser) &&
    safeEqual(credentials.password, expectedPassword)
  );
}
