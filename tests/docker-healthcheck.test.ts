import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(resolve(process.cwd(), "Dockerfile"), "utf8");

describe("production Docker healthcheck dependencies", () => {
  it("installs wget for Coolify's injected HTTP healthcheck", () => {
    expect(dockerfile).toMatch(
      /apt-get install -y -qq --no-install-recommends[\s\S]*\bcurl\b[\s\S]*\bwget\b/,
    );
  });
});
