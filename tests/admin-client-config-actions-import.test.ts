/**
 * Regression tests for CI #414 (validate-server-actions failure).
 *
 * Root cause: the `type ChangeActionType` import in
 * app/admin/client-config/actions.ts was dropped during a merge-conflict
 * resolution (merge commit f1e12ff of origin/main into the branch). The code
 * kept using `ChangeActionType` at actions.ts:62 but no longer imported it,
 * so the TypeScript phase of `next build` failed with
 * "Cannot find name 'ChangeActionType'." — failing the validate-server-actions
 * CI job before the RETIRE exclusion logic could even be exercised.
 *
 * These tests pin the import at source level so a future merge can never
 * silently drop it again without the test suite failing.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";

const SOURCE_PATH = new URL(
  "../app/admin/client-config/actions.ts",
  import.meta.url
).pathname;

describe("app/admin/client-config/actions.ts — ChangeActionType import (CI #414 regression)", () => {
  const source = fs.readFileSync(SOURCE_PATH, "utf8");

  it("imports ChangeActionType as a type from @/lib/validation-rules", () => {
    // The import from @/lib/validation-rules must keep the type import.
    // Dropping it broke CI #414; a merge that removes it must fail here.
    const importBlock = source.match(
      /import \{[\s\S]*?\} from "@\/lib\/validation-rules";/
    );
    expect(importBlock).not.toBeNull();
    expect(importBlock![0]).toContain("type ChangeActionType");
  });

  it("uses ChangeActionType in the dispatchClientConfigChange action args", () => {
    // The usage that required the import: dropping the import while keeping
    // this usage is exactly the failure mode from CI #414.
    expect(source).toMatch(/actionType:\s*ChangeActionType/);
  });

  it("still imports the runtime validation helper", () => {
    // Guard against the opposite mistake: removing the runtime import while
    // keeping its usage would also break the build.
    const importBlock = source.match(
      /import \{[\s\S]*?\} from "@\/lib\/validation-rules";/
    );
    expect(importBlock).not.toBeNull();
    expect(importBlock![0]).toContain("validateChangePortfolioConfiguration");
  });
});
