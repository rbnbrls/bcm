import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE, getProfile, resolveRole, roleHasPermission } from "@/lib/rbac";

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

  it("keeps the human names attached to the selectable profiles", () => {
    expect(getProfile("change_manager").fullName).toBe("Chris Change");
    expect(getProfile("account_manager").fullName).toBe("Arjan Accountmanager");
    expect(getProfile("admin").fullName).toBe("Bert Beheerder");
  });
});
