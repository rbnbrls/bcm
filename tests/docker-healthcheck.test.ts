import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(resolve(process.cwd(), "Dockerfile"), "utf8");
const deployWorkflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/deploy.yml"),
  "utf8",
);

describe("production Docker healthcheck dependencies", () => {
  it("installs wget for Coolify's injected HTTP healthcheck", () => {
    expect(dockerfile).toMatch(
      /apt-get install -y -qq --no-install-recommends[\s\S]*\bcurl\b[\s\S]*\bwget\b/,
    );
  });
});

describe("Coolify deployment workflow safeguards", () => {
  it("resolves the application UUID by exact name", () => {
    expect(deployWorkflow).toContain("COOLIFY_APPLICATION_NAME: bcm\n");
    expect(deployWorkflow).toContain(
      "https://dev.7rb.nl/api/v1/applications?search=${COOLIFY_APPLICATION_NAME}",
    );
    expect(deployWorkflow).toContain('app.get(\"name\") == target');
    expect(deployWorkflow).not.toContain("fl27k4hn1oh2dqgwd05ukox8");
  });

  it("fails closed when the trigger response has no deployment UUID", () => {
    expect(deployWorkflow).toContain("set -euo pipefail");
    expect(deployWorkflow).toContain("Coolify response did not include a deployment UUID");
    expect(deployWorkflow).toContain("Coolify trigger response did not include a deployment UUID");
    expect(deployWorkflow).toContain("./scripts/wait-for-deployment.sh");
  });
});
