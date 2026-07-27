/**
 * Tests for the ExportButton component.
 *
 * Uses source-level inspection to verify component structure,
 * exports, prop interface, API URL references, and behavioral patterns.
 * No jsdom or browser environment needed.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";

const SOURCE_PATH = new URL(
  "../../components/export-button.tsx",
  import.meta.url
).pathname;

describe("ExportButton — component structure", () => {
  it("should export the ExportButton component", async () => {
    const mod = await import("@/components/export-button");
    expect(mod.ExportButton).toBeDefined();
    expect(typeof mod.ExportButton).toBe("function");
  });

  it("should be a 'use client' component", () => {
    const source = fs.readFileSync(SOURCE_PATH, "utf8");
    expect(source).toContain('"use client"');
  });

  it("should accept changeRequestId prop", () => {
    const source = fs.readFileSync(SOURCE_PATH, "utf8");
    // The interface should define changeRequestId
    expect(source).toMatch(/changeRequestId:\s*string/);
  });

  it("should reference CSV and PDF download URLs", () => {
    const source = fs.readFileSync(SOURCE_PATH, "utf8");
    expect(source).toContain("/api/export/");
    // URL is built via template literal: `/api/export/${changeRequestId}?format=${format}`
    expect(source).toMatch(/format=\$\{format\}/);
    expect(source).toContain('triggerDownload("csv")');
    expect(source).toContain('triggerDownload("pdf")');
  });

  it("should have split button structure", () => {
    const source = fs.readFileSync(SOURCE_PATH, "utf8");
    expect(source).toContain("export-split");
    // Should have main button and arrow
    expect(source).toContain("handleDownloadCSV");
    expect(source).toContain("toggleDropdown");
  });

  it("should show loading text during download", () => {
    const source = fs.readFileSync(SOURCE_PATH, "utf8");
    expect(source).toContain("Exporteren");
  });
});

describe("ExportButton — behavior", () => {
  it("should reference both CSV and PDF format options", () => {
    const source = fs.readFileSync(SOURCE_PATH, "utf8");
    expect(source).toContain('"csv"');
    expect(source).toContain('"pdf"');
  });

  it("should have click-outside handler for dropdown", () => {
    const source = fs.readFileSync(SOURCE_PATH, "utf8");
    expect(source).toContain("mousedown");
    // Should removeEventListener on cleanup
    expect(source).toContain("removeEventListener");
  });

  it("should have a downloading state variable", () => {
    const source = fs.readFileSync(SOURCE_PATH, "utf8");
    expect(source).toContain("downloading");
    // Should disable buttons when downloading
    expect(source).toContain("disabled={downloading}");
  });

  it("should toggle dropdown open/close", () => {
    const source = fs.readFileSync(SOURCE_PATH, "utf8");
    expect(source).toContain("setOpen");
    expect(source).toContain("open");
  });

  it("should use ref callback for dropdown element", () => {
    const source = fs.readFileSync(SOURCE_PATH, "utf8");
    expect(source).toContain("setDropdownNode");
    expect(source).toContain("dropdownNode");
    expect(source).not.toContain("useRef");
  });

  it("should trigger download via hidden anchor element", () => {
    const source = fs.readFileSync(SOURCE_PATH, "utf8");
    expect(source).toContain("createElement");
    expect(source).toContain("a.click()");
    expect(source).toContain("document.body.removeChild");
  });
});
