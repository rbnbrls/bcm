import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { INITIAL_BLOCK_TYPES } from "@/lib/workflow-studio/block-registry";
import {
  WORKFLOW_STUDIO_OPERATING_DOCUMENTS,
  auditWorkflowStudioOperatingDocs,
} from "@/lib/workflow-studio/operational-readiness";
import { listWorkflowTemplateLibraryEntries } from "@/lib/workflow-studio/template-library";

describe("workflow studio operational readiness", () => {
  it("keeps the required operating handbook complete", () => {
    const documents = Object.fromEntries(
      WORKFLOW_STUDIO_OPERATING_DOCUMENTS.map((document) => [document.path, readFileSync(document.path, "utf8")]),
    );

    expect(auditWorkflowStudioOperatingDocs(documents)).toEqual({
      ok: true,
      checked: WORKFLOW_STUDIO_OPERATING_DOCUMENTS.map((document) => document.id),
      missing: [],
    });
  });

  it("documents every block currently exposed by the registry", () => {
    const blockReference = readFileSync("documentation/workflow-studio/workflow-block-reference.md", "utf8");

    for (const blockType of INITIAL_BLOCK_TYPES) {
      expect(blockReference).toContain(`\`${blockType}\``);
    }
  });

  it("documents every curated template library entry", () => {
    const templateManagement = readFileSync("documentation/workflow-studio/workflow-template-management.md", "utf8");

    for (const entry of listWorkflowTemplateLibraryEntries({ includeDeprecated: true })) {
      expect(templateManagement).toContain(`\`${entry.id}\``);
    }
  });

  it("links the operating handbook from the architecture index", () => {
    const index = readFileSync("documentation/architecture/README.md", "utf8");

    expect(index).toContain("../workflow-studio/README.md");
  });
});
