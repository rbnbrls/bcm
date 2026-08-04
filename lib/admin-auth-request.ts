import { accessDeniedIssue, requirePermission } from "@/lib/rbac-request";

export type AdminAuthResult =
  | { authorized: true }
  | { authorized: false; message: string };

/**
 * Defense-in-depth guard for admin server actions.
 */
export async function requireAdmin(): Promise<AdminAuthResult> {
  const access = await requirePermission("admin:access");
  return access.authorized
    ? { authorized: true }
    : { authorized: false, message: accessDeniedIssue(access) };
}
