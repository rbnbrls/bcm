import type { ChangeRequest } from "@/lib/types";

/* ── Constants ── */

export const CONTENT_TYPE_CSV = "text/csv; charset=utf-8";
export const CONTENT_TYPE_PDF = "application/pdf";

/* ── Types ── */

export type ExportFormat = "csv" | "pdf";

export interface ExportRow {
  portfolioName: string;
  portfolioReference: string;
  istBenchmarkCode: string;
  istBenchmarkName: string;
  sollBenchmarkCode: string;
  sollBenchmarkName: string;
  cost: number;
}

/* ── Helpers ── */

/**
 * Build a sanitised slug from a client name:
 * lowercase, replace spaces/special chars with hyphens, collapse runs.
 */
function clientSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Strip or escape characters that are unsafe in HTTP header values
 * and Content-Disposition filenames.
 */
function sanitizeFilenameComponent(s: string): string {
  return s.replace(/["\r\n]/g, "").replace(/[^a-zA-Z0-9_\-. ]/g, "-");
}

/**
 * Build the export filename per D-08:
 *   {reference}-{clientSlug}-{date}.{ext}
 */
export function buildExportFilename(request: ChangeRequest, ext: string): string {
  const date = request.effectiveDate
    ? new Date(request.effectiveDate).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const slug = clientSlug(request.clientName);
  const ref = sanitizeFilenameComponent(request.reference);
  return `${ref}-${slug}-${date}.${ext}`;
}

/**
 * Escape a CSV field value:
 * - If it contains a semicolon, quote, or newline, wrap in double-quotes
 * - Double any internal double-quotes
 */
function escapeCsvField(value: string | number | undefined | null): string {
  let str = value == null ? "" : String(value);
  // Prevent CSV formula injection (CWE-1236) — prefix `=`, `+`, `-`, `@`, `\t` with a single quote
  if (/^[=+\-@\t]/.test(str)) {
    str = "'" + str;
  }
  if (str.includes(";") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build CSV content for a change request.
 * Uses semicolons as delimiter (Dutch locale), UTF-8 BOM prefix,
 * Dutch column headers.
 *
 * Format:
 *   - Metadata header block (comment-style rows)
 *   - Empty row
 *   - Column header row (Dutch)
 *   - Per-portfolio data rows
 */
export function buildCsvContent(request: ChangeRequest): string {
  const rows: string[] = [];

  // Metadata block
  rows.push(`Referentie;${escapeCsvField(request.reference)}`);
  rows.push(`Client;${escapeCsvField(request.clientName)}`);
  rows.push(`Clientreferentie;${escapeCsvField(request.clientReference)}`);
  rows.push(`Aanvrager;${escapeCsvField(request.requestedBy)}`);
  rows.push(`Type;${escapeCsvField(request.changeTypeConfig?.name ?? request.changeType)}`);
  rows.push(`Status;${escapeCsvField(request.status)}`);
  rows.push(`Ingangsdatum;${escapeCsvField(request.effectiveDate)}`);
  rows.push(`Reden;${escapeCsvField(request.rationale)}`);

  // Empty separator row
  rows.push("");

  // Column header row (Dutch)
  const headers = [
    "Portefeuille",
    "Referentie",
    "IST Benchmark Code",
    "IST Benchmark Naam",
    "SOLL Benchmark Code",
    "SOLL Benchmark Naam",
    "Kosten (EUR)",
  ];
  rows.push(headers.join(";"));

  // Per-portfolio data rows
  const costFormatter = new Intl.NumberFormat("nl-NL", {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  for (const item of request.items) {
    const row = [
      escapeCsvField(item.portfolioName),
      escapeCsvField(item.portfolioReference),
      escapeCsvField(item.previousBenchmark.code),
      escapeCsvField(item.previousBenchmark.name),
      escapeCsvField(item.requestedBenchmark.code),
      escapeCsvField(item.requestedBenchmark.name),
      escapeCsvField(costFormatter.format(item.requestedBenchmark.cost)),
    ].join(";");
    rows.push(row);
  }

  // BOM prefix + CRLF line endings
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}

/**
 * Map ChangeRequest items to ExportRow[].
 * @internal
 * @deprecated Not wired into any consumer. Kept as a reference implementation
 *   for future use when row-level transformation is needed.
 * TODO: Wire into PDF generator or CSV builder, or remove in a future cleanup pass.
 */
export function exportRequestToRows(request: ChangeRequest): ExportRow[] {
  return request.items.map((item) => ({
    portfolioName: item.portfolioName,
    portfolioReference: item.portfolioReference,
    istBenchmarkCode: item.previousBenchmark.code,
    istBenchmarkName: item.previousBenchmark.name,
    sollBenchmarkCode: item.requestedBenchmark.code,
    sollBenchmarkName: item.requestedBenchmark.name,
    cost: item.requestedBenchmark.cost,
  }));
}
