import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  auditChangeTypeRuntimeCutover,
  changeTypeRuntimeStartHref,
  resolveChangeTypeRuntimeCutover,
} from "@/lib/change-type-runtime-cutover";

const published = [{ id: "version-published", status: "published", definitionSlug: "benchmark_switch" }] as const;

describe("change type runtime cutover", () => {
  it("routes active change types with a published workflow version to runtime start", () => {
    const decision = resolveChangeTypeRuntimeCutover({
      slug: "benchmark_switch",
      active: true,
      workflowVersionId: "version-published",
    }, published);

    expect(decision).toEqual({
      slug: "benchmark_switch",
      mode: "runtime",
      workflowVersionId: "version-published",
      startHref: "/workflow-runtime/version-published/start",
    });
  });

  it("blocks active change types without a workflow version", () => {
    const decision = resolveChangeTypeRuntimeCutover({
      slug: "fee_change",
      active: true,
      workflowVersionId: null,
    }, published);

    expect(decision).toMatchObject({
      mode: "blocked_missing_version",
      issue: "Actief change type heeft geen workflow_version_id.",
    });
    expect(changeTypeRuntimeStartHref({
      slug: "fee_change",
      active: true,
      workflowVersionId: null,
    }, published)).toBe("/change-catalog/fee_change");
  });

  it("blocks active change types pointing at draft or unknown workflow versions", () => {
    expect(resolveChangeTypeRuntimeCutover({
      slug: "mandate_change",
      active: true,
      workflowVersionId: "version-draft",
    }, [{ id: "version-draft", status: "draft" }])).toMatchObject({ mode: "blocked_unpublished_version" });

    expect(resolveChangeTypeRuntimeCutover({
      slug: "custodian_change",
      active: true,
      workflowVersionId: "version-missing",
    }, published)).toMatchObject({ mode: "blocked_unpublished_version" });
  });

  it("keeps inactive historical configs in classic compatibility mode", () => {
    expect(resolveChangeTypeRuntimeCutover({
      slug: "portfolio_addition",
      active: false,
      workflowVersionId: null,
    }, published)).toEqual({
      slug: "portfolio_addition",
      mode: "classic_compatibility",
      workflowVersionId: null,
      startHref: null,
    });
  });

  it("audits all active change types as the G4 cutover gate", () => {
    const audit = auditChangeTypeRuntimeCutover([
      { slug: "benchmark_switch", active: true, workflowVersionId: "version-published" },
      { slug: "fee_change", active: true, workflowVersionId: null },
      { slug: "portfolio_addition", active: false, workflowVersionId: null },
    ], published);

    expect(audit.ok).toBe(false);
    expect(audit.issues.map((issue) => issue.slug)).toEqual(["fee_change"]);
  });

  it("adds a real workflow_version foreign key and active index to change_type_config", () => {
    const schema = readFileSync("db/init.sql", "utf8");

    expect(schema).toContain("workflow_version_id uuid REFERENCES workflow_version(id) ON DELETE RESTRICT");
    expect(schema).toContain("idx_ctc_workflow_version");
  });
});
