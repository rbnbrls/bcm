import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE, NAVIGATION_ITEMS, canNavigateTo, getProfile, resolveRole, roleHasPermission } from "@/lib/rbac";
import { RBAC_CONFIG } from "@/lib/rbac-config";

describe("role based access control", () => {
  it("defaults to the change manager profile in test mode", () => {
    expect(resolveRole(undefined)).toBe(DEFAULT_ROLE);
    expect(roleHasPermission(DEFAULT_ROLE, "changes:create")).toBe(true);
    expect(roleHasPermission(DEFAULT_ROLE, "changes:approve")).toBe(false);
    expect(roleHasPermission(DEFAULT_ROLE, "admin:access")).toBe(false);
  });

  it("allows account managers to approve but not create or administer", () => {
    expect(roleHasPermission("account_manager", "changes:approve")).toBe(true);
    expect(roleHasPermission("account_manager", "changes:create")).toBe(false);
    expect(roleHasPermission("account_manager", "admin:access")).toBe(false);
  });

  it("allows administrators to access admin only", () => {
    expect(roleHasPermission("admin", "admin:access")).toBe(true);
    expect(roleHasPermission("admin", "changes:create")).toBe(false);
    expect(roleHasPermission("admin", "changes:approve")).toBe(false);
  });

  it("gives workflow:start only to the change manager profile (#611 expectation)", () => {
    // Issue #611 root cause: the admin role lacks workflow:start, so an admin
    // identity gets permission_denied from the runtime start service. This is
    // the intended RBAC split (product decision), pinned as a regression guard.
    expect(roleHasPermission("change_manager", "workflow:start")).toBe(true);
    expect(roleHasPermission("admin", "workflow:start")).toBe(false);
    expect(roleHasPermission("account_manager", "workflow:start")).toBe(false);
  });

  it("keeps the human names attached to the selectable profiles", () => {
    expect(getProfile("change_manager").fullName).toBe("Chris Change");
    expect(getProfile("account_manager").fullName).toBe("Arjan Accountmanager");
    expect(getProfile("admin").fullName).toBe("Bert Beheerder");
  });

  it("loads profiles and visible navigation from the RBAC config", () => {
    expect(DEFAULT_ROLE).toBe(RBAC_CONFIG.defaultRole);
    expect(NAVIGATION_ITEMS).toEqual(RBAC_CONFIG.navigationItems);
    expect(RBAC_CONFIG.navigationItems.some((item) => item.href === "/changes")).toBe(false);
    expect(RBAC_CONFIG.navigationItems.some((item) => item.href === "/reports")).toBe(false);
    expect(canNavigateTo("change_manager", "/admin/client-config")).toBe(false);
    expect(canNavigateTo("admin", "/admin/client-config")).toBe(true);
  });
});
