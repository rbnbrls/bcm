import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(resolve(__dirname, "../Dockerfile"), "utf8");

describe("Coolify Docker healthcheck prerequisites", () => {
  it("installs wget because Coolify's HTTP healthcheck invokes it", () => {
    expect(dockerfile).toMatch(
      /apt-get install -y -qq --no-install-recommends[\s\\]*curl ca-certificates wget/,
    );
  });
});

const deployWorkflow = readFileSync(
  resolve(__dirname, "../.github/workflows/deploy.yml"),
  "utf8",
);

describe("Coolify deployment target resolution", () => {
  it("resolves the application UUID by exact name instead of a stale hardcoded UUID", () => {
    expect(deployWorkflow).toContain("COOLIFY_APPLICATION_NAME: bcm-test");
    expect(deployWorkflow).toContain(
      "https://dev.7rb.nl/api/v1/applications",
    );
    expect(deployWorkflow).toContain(
      'app.get("name") == target',
    );
    expect(deployWorkflow).not.toContain("fl27k4hn1oh2dqgwd05ukox8");
  });

  it("fails closed when triggering or waiting for deployment fails", () => {
    expect(deployWorkflow).toContain("set -euo pipefail");
    expect(deployWorkflow).toContain("curl -sS --fail-with-body -X POST");
    expect(deployWorkflow).toContain(
      'Coolify response did not include a deployment UUID',
    );
    expect(deployWorkflow).toContain("curl -sS --fail-with-body");
    expect(deployWorkflow).toContain('echo "::error::Deployment ${STATUS}."');
    expect(deployWorkflow).toContain("exit 1");
    expect(deployWorkflow).toContain("Deployment did not finish within timeout");
  });
});
