# Phase 1: Export Feature — Context

**Gathered:** 2026-07-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement an export/download feature for change request details so users can download a CSV or PDF summary of change requests. The current "Exporteer request (binnenkort)" button on the change request detail page should become functional.

</domain>

<decisions>
## Implementation Decisions

### Export Format
- Support **both CSV and PDF** formats — user chooses
- CSV uses **semicolons** as delimiter (Dutch locale), **UTF-8 with BOM**, **Dutch column headers**
- CSV constructed server-side manually (no library needed)
- PDF uses a server-side library (e.g., `@react-pdf/renderer` or `html2canvas` + `jspdf`)

### Export Scope
- Export the **current change request** only (button is on the detail page)
- Include **full IST/SOLL diff** per portfolio
- Include **request metadata header** (reference, client, requester, rationale, date)
- Include **cost and lead time** estimates per portfolio

### Trigger & UX
- **Split button / button group** — user clicks arrow to choose CSV or PDF
- Default filename: `{reference}-{clientSlug}-{date}.{ext}`
- **Immediate download** — no intermediate page or preview
- **Loading feedback** — button becomes disabled + "Exporteren..." spinner while generating

### Implementation Approach
- **Server-side generation** for both formats (via API route `/api/export/{id}?format=csv|pdf`)
- API route approach — clean, cachable, works with `<a>` direct download
- Manual CSV string construction
- PDF via `@react-pdf/renderer` or jsPDF + html2canvas

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getChangeRequest(id)` in `lib/db.ts` — fetches all data needed for export
- `ChangeRequest` and `Benchmark` types in `lib/types.ts`
- Button component pattern: `button class="button button-primary"` in `app/changes/[id]/page.tsx`
- Dutch locale formatting: `new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" })`

### Established Patterns
- Server actions for mutations (`"use server"`), API routes for data endpoints
- `globals.css` for all styling (no CSS framework)
- Fixture database fallback when DB unavailable
- Zod for validation, `randomUUID()` from crypto

### Integration Points
- `app/changes/[id]/page.tsx` line 103 — the "Exporteer request (binnenkort)" placeholder button
- New API route: `app/api/export/[id]/route.ts`
- Database patterns from `lib/db.ts` — read operations

</code_context>

<specifics>
## Specific Ideas

- CSV should include: reference, client name, client reference, change type, requester, effective date, rationale, and per-portfolio rows with portfolio name, IST benchmark, SOLL benchmark, cost, lead time
- PDF should match the visual layout of the detail page (header, IST/SOLL diff section, metadata)
- The split button should be a `<div>` with two `<button>` elements styled as one control

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>
