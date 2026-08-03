/**
 * Regression tests for CI #413 (duplicate import in client-config-table).
 *
 * Root cause: `canEditClientConfigRow` was imported TWICE in
 * app/admin/client-config/client-config-table.tsx — once from the base
 * (main, commit 54a62d1) and once from the PR branch (cab37fc9). The
 * duplicate only existed in the GitHub auto-generated merge ref
 * (refs/pull/399/merge, e4efa29) that CI checked out, which broke every
 * job for the same reason:
 *   - test (22):     vite:oxc PARSE_ERROR "Identifier `canEditClientConfigRow`
 *                    has already been declared" at :15:10
 *   - validate-server-actions: Turbopack build "the name
 *                    `canEditClientConfigRow` is defined multiple times" at :18:10
 *   - e2e-db-test / e2e-test: Next dev server cannot compile the file, so the
 *                    admin page never renders (Playwright times out on
 *                    table.config-table visibility).
 *
 * These tests pin the import at source level so a future merge can never
 * silently duplicate (or drop) it again without the test suite failing.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";

const SOURCE_PATH = new URL(
  "../app/admin/client-config/client-config-table.tsx",
  import.meta.url
).pathname;

describe("app/admin/client-config/client-config-table.tsx — canEditClientConfigRow import (CI #413 regression)", () => {
  const source = fs.readFileSync(SOURCE_PATH, "utf8");

  it("imports canEditClientConfigRow exactly once from @/lib/client-config-edit-permission", () => {
    // CI #413 failure mode: the import present twice breaks vite/oxc and
    // Turbopack with "already been declared" / "defined multiple times".
    const imports = source.match(
      /import\s*\{[^}]*canEditClientConfigRow[^}]*\}\s*from\s*"@\/lib\/client-config-edit-permission";/g
    );
    expect(imports).not.toBeNull();
    expect(imports!.length).toBe(1);
  });

  it("uses canEditClientConfigRow as the default canEditRow permission", () => {
    // The import exists to back the default `canEditRow` predicate; dropping
    // the import while keeping this usage is the CI #403/#414 failure mode.
    expect(source).toMatch(/canEditRow\s*=\s*canEditClientConfigRow/);
  });
});
