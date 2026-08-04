import { headers } from "next/headers";
import {
  adminIsAuthorized,
  UNAUTHORIZED_MESSAGE,
} from "@/lib/admin-auth";

export type AdminAuthResult =
  | { authorized: true }
  | { authorized: false; message: string };

/**
 * Defense-in-depth guard for admin server actions.
 *
 * The route-level gate (proxy.ts) already rejects every anonymous
 * request to /admin/* — including the POSTs that carry server actions —
 * but an action must never trust that alone: if the action file is ever
 * moved out of the protected path, or the proxy matcher changes, this
 * check is the last line of defense before any write happens.
 *
 * Call it as the FIRST statement of every admin action, e.g.:
 *
 *   const auth = await requireAdmin();
 *   if (!auth.authorized) return { issues: [auth.message] };
 *
 * Fails closed: outside a request scope (headers() throws) or without
 * configured credentials the caller is treated as unauthorized.
 */
export async function requireAdmin(): Promise<AdminAuthResult> {
  let authorization: string | null = null;
  try {
    authorization = (await headers()).get("authorization");
  } catch {
    // No request scope (e.g. direct invocation outside HTTP) — deny.
  }

  if (adminIsAuthorized(authorization)) {
    return { authorized: true };
  }
  return { authorized: false, message: UNAUTHORIZED_MESSAGE };
}
