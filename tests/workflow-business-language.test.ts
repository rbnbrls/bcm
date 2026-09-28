import { describe, expect, it } from "vitest";
import { businessLabel, WORKFLOW_GLOSSARY } from "@/lib/workflow-studio/business-language";

describe("workflow business language", () => {
  it("maps internal graph terms to business language", () => {
    expect(businessLabel("node")).toBe("processtap");
    expect(businessLabel("edge")).toBe("verbinding");
    expect(businessLabel("blockType")).toBe("soort stap");
    expect(businessLabel("unknown")).toBe("unknown");
  });

  it("contains explanations for the workflow lifecycle terms", () => {
    expect(WORKFLOW_GLOSSARY.map((item) => item.term)).toEqual(expect.arrayContaining([
      "Rol", "Scope", "Goedkeuring", "Concept", "Ter review", "Publiceren", "Impact",
    ]));
  });
});
