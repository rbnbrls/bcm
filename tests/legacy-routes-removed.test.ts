/**
 * Regression guards for the removed legacy benchmark/asset-class request
 * functionality (PR #596).
 *
 * The four page routes (and their form components) were deleted. These checks
 * are deliberately filesystem/source based: they fail the moment a legacy route
 * directory, form component, or a reference to a removed route path is
 * re-introduced anywhere in the app, without needing a browser or a database.
 *
 * The kept change-detail API endpoint (GET /api/benchmarks/[id]/name) is
 * asserted to still exist so a future cleanup does not remove it by accident.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(__dirname, "..", "app");
const COMPONENTS_DIR = join(__dirname, "..", "components");

const REMOVED_ROUTE_DIRS = [
  "benchmarks",
  "benchmark-aanvraag",
  "asset-class-aanvraag",
  "sub-asset-class-aanvraag",
] as const;

const REMOVED_FORM_COMPONENTS = [
  "benchmark-new-form.tsx",
  "asset-class-request-form.tsx",
  "sub-asset-class-request-form.tsx",
] as const;

/**
 * Removed page-route paths as they would appear in a link href, redirect or
 * push target. The kept API endpoint is `/api/benchmarks/[id]/name`, so a bare
 * `/benchmarks` string (not preceded by `/api`) is exactly the removed page.
 */
const REMOVED_ROUTE_PATHS = [
  "/benchmark-aanvraag",
  "/asset-class-aanvraag",
  "/sub-asset-class-aanvraag",
  /(^|[^a-z/])\/benchmarks(?!\/)/i,
] as const;

describe("removed legacy benchmark/asset-class routes", () => {
  it.each(REMOVED_ROUTE_DIRS)("app/%s route directory is gone", (dir) => {
    expect(existsSync(join(APP_DIR, dir))).toBe(false);
  });

  it.each(REMOVED_FORM_COMPONENTS)("components/%s is gone", (file) => {
    expect(existsSync(join(COMPONENTS_DIR, file))).toBe(false);
  });

  it("keeps the change-detail benchmark name API endpoint", () => {
    expect(existsSync(join(APP_DIR, "api", "benchmarks", "[id]", "name", "route.ts"))).toBe(true);
  });

  it("no source file under app/ or components/ references a removed route path", () => {
    const offenders: string[] = [];
    for (const dir of [APP_DIR, COMPONENTS_DIR]) {
      for (const file of listSourceFiles(dir)) {
        const content = readFileSync(file, "utf8");
        const matched = REMOVED_ROUTE_PATHS.some((path) =>
          typeof path === "string" ? content.includes(path) : path.test(content),
        );
        if (matched) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}
