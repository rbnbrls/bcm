---
phase: 03-ui-polish
reviewed: 2026-07-25T12:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - app/loading.tsx
  - app/error.tsx
  - app/benchmark-aanvraag/loading.tsx
  - app/benchmark-aanvraag/error.tsx
  - app/benchmarks/loading.tsx
  - app/benchmarks/error.tsx
  - app/changes/[id]/loading.tsx
  - app/changes/[id]/error.tsx
  - app/changes/new/loading.tsx
  - app/changes/new/error.tsx
  - app/updates/error.tsx
  - app/admin/client-config/loading.tsx
  - app/admin/client-config/error.tsx
  - app/globals.css
  - tests/e2e/a11y.spec.ts
  - components/updates-timeline.tsx
  - components/export-button.tsx
  - components/feedback-button.tsx
  - components/benchmark-new-form.tsx
  - components/benchmark-change-form.tsx
  - app/updates/page.tsx
  - app/changes/[id]/page.tsx
  - app/benchmark-aanvraag/actions.ts
  - app/changes/new/actions.ts
  - app/feedback/actions.ts
  - lib/export.ts
  - lib/export-pdf.tsx
findings:
  critical: 0
  warning: 6
  info: 3
  total: 9
status: issues_found
---

# Phase 3: Code Review Report — UI Polish

**Reviewed:** 2026-07-25T12:00:00Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

27 source files reviewed across loading skeletons, error boundaries, global CSS, components, actions, and E2E accessibility tests. No critical security vulnerabilities or data-loss risks found. Six warnings were identified: hydration mismatch from `Math.random()` in SSR skeletons, invalid HTML structure (`<li>` without `<ul>`), timezone-dependent date validation, duplicate fetch logic, premature `:invalid` styling on untouched forms, and future-date handling in time formatting. Three info items cover unused code, fragile form serialization, and hardcoded author names.

---

## Warnings

### WR-01: `Math.random()` in server-component loading skeletons causes React hydration mismatch

**Files:**
- `app/benchmarks/loading.tsx:28`
- `app/admin/client-config/loading.tsx:28`

**Issue:** Both files use `Math.random()` to generate random skeleton widths during server-side rendering:

```tsx
// benchmarks/loading.tsx:28
style={{ width: `${60 + Math.random() * 30}%`, height: 12 }}
// admin/client-config/loading.tsx:28
style={{ width: `${50 + Math.random() * 40}%`, height: 12 }}
```

These loading components are server components (no `"use client"` directive). In Next.js App Router, `loading.tsx` is server-rendered when a parent async page suspends. `Math.random()` produces different values on the server and during client hydration, causing a React hydration mismatch warning in development and potentially unstable layouts in production.

**Fix:** Replace `Math.random()` with a deterministic pseudo-random approach based on a stable seed (e.g., index or row/col position):

```tsx
// Deterministic width based on row and column index
const widths = ["55%", "70%", "60%", "80%", "65%", "75%"];
// ...
style={{ width: widths[col % widths.length], height: 12 }}
```

Or use CSS-only shimmer without inline width randomization:

```tsx
// Remove inline width randomization; use CSS class with fixed widths
<td><div className="skeleton skeleton-cell" /></td>
```

---

### WR-02: `<li>` elements rendered without `<ul>` parent — invalid HTML

**Files:**
- `components/benchmark-new-form.tsx:122-126`
- `components/benchmark-change-form.tsx:131`

**Issue:** Both components render `<li>` items directly inside a `<div>` instead of wrapping them in `<ul>`:

```tsx
{/* benchmark-new-form.tsx:122-126 */}
{state.issues && (
  <div className="form-errors" role="alert" aria-live="polite">
    <b>Controleer de aanvraag</b>
    {state.issues.map((issue: string) => <li key={issue}>{issue}</li>)}
  </div>
)}
```

```tsx
{/* benchmark-change-form.tsx:131 */}
{state.issues && <div className="form-errors" role="alert" aria-live="polite">
  <b>Controleer de aanvraag</b>
  <ul>{state.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
</div>}
```

Note: the `benchmark-change-form.tsx` already wraps in `<ul>` (line 131), but `benchmark-new-form.tsx` does not (line 124). Screen readers and assistive technologies expect list items to be contained in a proper `<ul>` or `<ol>` — invalid HTML breaks the accessibility tree and may confuse AT users.

**Fix:** Wrap `<li>` elements in `<ul>` in `benchmark-new-form.tsx`:

```tsx
{state.issues && (
  <div className="form-errors" role="alert" aria-live="polite">
    <b>Controleer de aanvraag</b>
    <ul>
      {state.issues.map((issue: string) => <li key={issue}>{issue}</li>)}
    </ul>
  </div>
)}
```

---

### WR-03: Timezone-dependent date comparison can reject valid dates

**Files:**
- `app/benchmark-aanvraag/actions.ts:26`
- `app/changes/new/actions.ts:58`

**Issue:** Both actions compare the user-provided date (from `<input type="date">`, which is in local timezone) against `new Date().toISOString().slice(0, 10)`, which returns the UTC date with `Z` offset already applied:

```ts
// benchmark-aanvraag/actions.ts:26
if (data.effectiveDate < new Date().toISOString().slice(0, 10)) {
  return { issues: ["De ingangsdatum mag niet in het verleden liggen."] };
}

// changes/new/actions.ts:58
if (input.data.effectiveDate < new Date().toISOString().slice(0, 10))
  return { issues: ["De ingangsdatum mag niet in het verleden liggen."] };
```

Example: on 2026-07-25 at 22:30 UTC+2 (which is 20:30 UTC), the user enters `2026-07-25` in the date picker. `new Date().toISOString()` returns `"2026-07-25T20:30:00.000Z"`, which slices to `"2026-07-25"` — this works. But at 01:00 UTC+2 on 2026-07-26 (23:00 UTC on 2026-07-25), the user enters `2026-07-25` (yesterday in their local time). The comparison `"2026-07-25" < "2026-07-25"` returns `false` — this rejects what the user considers a past date correctly.

Wait — the actual bug is the *opposite* direction. Consider: user in NL (UTC+2) at 23:00 local time (21:00 UTC) on 2026-07-25 enters `2026-07-25` as effective date. The comparison is `"2026-07-25" < "2026-07-25"` → `false` → date is accepted. But the user meant today, and today in UTC is `2026-07-25` — this works.

The real issue: user in NL at 01:00 on 2026-07-26 (23:00 UTC on 2026-07-25) selects `2026-07-26` as effective date (today in local time). The comparison is `"2026-07-26" < "2026-07-25"` → `false` → date accepted. But UTC today is `2026-07-25`, so `data.effectiveDate` (`2026-07-26`) is ahead of UTC today — it's treated as a future date. This is **correct behavior** (the date is indeed today and should be allowed).

The actual failure case: user in NL at 23:00 on 2026-07-25 selects `2026-07-25` (today in local time). UTC today is `2026-07-25`. Comparison: `"2026-07-25" < "2026-07-25"` → `false` → accepted. This is fine.

But what about: user in NL at 23:00 on 2026-07-25 UTC+2 (21:00 UTC) selects `2026-07-26` (tomorrow's date). UTC today is `2026-07-25`. `"2026-07-26" < "2026-07-25"` → `false` → accepted. Correct.

The actual bug manifests near midnight UTC. Consider: NL at 01:00 on 2026-07-26 UTC+2 (23:00 UTC on 2026-07-25). User selects `2026-07-25` (yesterday in local time, but they think it's "today"). UTC today is `2026-07-25`. `"2026-07-25" < "2026-07-25"` → `false` → accepted! This is actually wrong — `2026-07-25` IS the current UTC date, and the comparison doesn't catch past dates from the user's perspective.

Let me re-examine. The intent is: "effective date must not be in the past." If today is 2026-07-25, the user can enter `2026-07-25` or any future date. The check is `data.effectiveDate < todayUTC`. Since `effectiveDate` comes from `<input type="date">` and the `toISOString().slice(0,10)` gives UTC date, the comparison is between two date strings in `YYYY-MM-DD` format (same timezone — both are just dates). String comparison works correctly for ISO dates.

The confusion was mine — the `toISOString()` slice gives UTC date, and `<input type="date">` returns the date in the user's local timezone as `YYYY-MM-DD`. So `"2026-07-26" < "2026-07-25"` would be `false` (26th is indeed >= 25th). And `"2026-07-24" < "2026-07-25"` would be `true` (24th is indeed in the past).

But there IS an edge case: if the user in NL at 01:00 on July 26th (which is July 25th 23:00 UTC) enters `2026-07-25` (yesterday in their local time, but the current UTC date), the check compares `"2026-07-25" < "2026-07-25"` → `false` → date is accepted even though it IS yesterday from the user's perspective. This is a legitimate timezone edge case where a past local date slips through because the UTC date hasn't rolled over yet.

However, this is a very narrow edge case (1 hour window for NL, larger for negative UTC offsets), and the practical impact is minimal — the date is at most ~12 hours in the past. This is borderline between WARNING and INFO. I'll keep it as WARNING because it's a correctness issue in time-sensitive validation.

**Fix:** Use a timezone-aware comparison that normalizes both dates to the same timezone:

```ts
// Use midnight local time for comparison
const todayLocal = new Date().toLocaleDateString("en-CA"); // "en-CA" gives YYYY-MM-DD format
if (data.effectiveDate < todayLocal) {
  return { issues: ["De ingangsdatum mag niet in het verleden liggen."] };
}
```

Or, better, use the `Intl.DateTimeFormat` with explicit timezone:

```ts
const todayLocal = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Amsterdam",
}).format(new Date()); // Also accepts "Asia/Singapore", etc.
```

---

### WR-04: Duplicate fetch logic in UpdatesPage

**File:** `app/updates/page.tsx:11-74`

**Issue:** The `fetchCommits` useCallback (lines 11-36) and the fetch logic inside `useEffect` (lines 38-74) are nearly identical copies of the same API call. The `useEffect`'s `load()` function duplicates all the fetch/error handling logic instead of calling `fetchCommits()`. This violates DRY — any future change to the fetch logic must be made in two places.

```tsx
// Line 11-36 — standalone callback with its own error/loading/state logic
const fetchCommits = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const res = await fetch("/api/commits");
    // ... error handling ...
    setCommits(...);
  } catch (err) {
    setError(...);
  } finally {
    setLoading(false);
  }
}, []);

// Line 38-74 — duplicate of fetchCommits inside useEffect
useEffect(() => {
  let cancelled = false;
  async function load() {
    setLoading(true);
    // ... identical fetch logic ...
  }
  load();
  return () => { cancelled = true; };
}, []);
```

**Fix:** Call `fetchCommits()` from `useEffect` instead of duplicating the logic, and handle the cancellation flag:

```tsx
const fetchCommits = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const res = await fetch("/api/commits");
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Fout bij ophalen (${res.status})`);
    }
    const data = await res.json();
    if (!cancelledRef.current) {
      setCommits(Array.isArray(data.commits) ? data.commits : []);
    }
  } catch (err) {
    if (!cancelledRef.current) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    }
  } finally {
    if (!cancelledRef.current) {
      setLoading(false);
    }
  }
}, []);

useEffect(() => {
  const cancelledRef = { current: false };
  fetchCommits();
  return () => { cancelledRef.current = true; };
}, [fetchCommits]);
```

Note: The `cancelled` flag must be stored in a ref (or as a module-scoped variable in the callback) to avoid capturing stale closures. Alternatively, use `useRef` for the cancellation flag.

---

### WR-05: `:invalid` pseudo-class shows error styling on untouched form fields

**File:** `app/globals.css:953-956`

**Issue:** The `:invalid` selector applies red borders to all empty required form fields immediately on page load:

```css
input:invalid,
select:invalid,
textarea:invalid {
  border-color: var(--danger);
}
input:invalid:focus,
select:invalid:focus,
textarea:invalid:focus {
  box-shadow: 0 0 0 3px rgba(164, 64, 50, .1);
}
```

Browsers apply the `:invalid` pseudo-class to empty `required` fields before any user interaction. This means every form page renders with red borders on all required inputs, creating a confusing "everything is wrong before I've done anything" UX pattern.

**Note:** `.feedback-form input:focus` (lines 118-124) correctly removes `outline: none` and applies its own styling, but the `:invalid` cascade applies globally.

**Fix:** Either:
1. Remove the global `:invalid` rules and only apply them after user interaction (via `:user-invalid` pseudo-class — a newer CSS selector not yet widely supported), or
2. Add `:not(:focus):not(:placeholder-shown)` to suppress the invalid styling on empty fields:

```css
input:invalid:not(:focus):not(:placeholder-shown),
select:invalid:not(:focus):not(:placeholder-shown),
textarea:invalid:not(:focus):not(:placeholder-shown) {
  border-color: var(--danger);
}
```

Or use CSS `:user-invalid` (when browser support permits):
```css
input:user-invalid,
select:user-invalid,
textarea:user-invalid {
  border-color: var(--danger);
}
```

---

### WR-06: `formatTimeAgo` handles future dates incorrectly — shows "zojuist"

**File:** `components/updates-timeline.tsx:109-133`

**Issue:** The `formatTimeAgo` function does not guard against future dates. If `dateStr` is in the future, `diffMs` becomes negative, which makes `diffSeconds` negative, and the first condition `diffSeconds < 60` is true (since negative < 60). The function returns "zojuist" for future dates:

```ts
export function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();  // negative for future dates
  const diffSeconds = Math.floor(diffMs / 1000);  // negative
  // ...
  if (diffSeconds < 60) return "zojuist";  // true for all future dates
```

While commit dates from the API are typically in the past, this becomes a bug if:
- The system clock is skewed
- A commit date is accidentally set in the future
- The API returns an improperly formatted date string that `new Date()` parses as a future date (e.g., year/month swapped)

**Fix:** Add an early return for future dates:

```ts
export function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  
  if (diffMs < 0) return "in de toekomst";  // or format as absolute date
  
  // ... rest of the function unchanged
}
```

---

## Info

### IN-01: Unused/deprecated `exportRequestToRows` function

**File:** `lib/export.ts:143-153`

**Issue:** The `exportRequestToRows()` function is documented as `@deprecated` and "Not wired into any consumer." It has a TODO comment to either wire it in or remove it. This is dead code that adds to maintenance burden.

```ts
/**
 * @deprecated Not wired into any consumer. Kept as a reference implementation
 *   for future use when row-level transformation is needed.
 * TODO: Wire into PDF generator or CSV builder, or remove in a future cleanup pass.
 */
```

**Fix:** Either wire it into the PDF/CSV generation or remove it. If kept as reference, add a `@reason` annotation explaining why it's preserved.

---

### IN-02: Duplicate `name="clientId"` on hidden input and `<select>` element

**File:** `components/benchmark-change-form.tsx:66,71`

**Issue:** Both the hidden input (line 66) and the `<select>` element (line 71) have `name="clientId"`:

```tsx
<input name="clientId" type="hidden" value={clientId} />
<select name="clientId" value={clientId} onChange={(event) => chooseClient(event.target.value)}>
```

Form serialization includes both entries — the hidden input and the selected `<option>` value. `Object.fromEntries(formData)` keeps the last entry, which depends on browser serialization order. While this works in practice, it's fragile and confusing.

The hidden input's `value` is React-controlled (state-driven), while the `<select>` sends the DOM's selected option value. Since both are in sync (both derive from `clientId` state), this works, but the duplicate naming could cause subtle bugs if form serialization order varies.

**Fix:** Remove `name="clientId"` from the `<select>` element since only the hidden input is needed for form submission:

```tsx
<select value={clientId} onChange={(event) => chooseClient(event.target.value)}>
```

---

### IN-03: Hardcoded author names in `authorName()` utility

**File:** `components/updates-timeline.tsx:152-154`

**Issue:** The `authorName()` function maps specific usernames to display names:

```ts
export function authorName(author: string): string {
  if (author === "Hermes Agent") return "🤖 Hermes";
  if (author === "rbnbrls" || author === "ruben") return "Ruben";
  return author;
}
```

New contributors or CI/CD automation accounts will display their raw git username rather than a friendlier display name. The function is also locale-specific (Dutch).

**Fix:** Consider a configuration-driven approach (author map passed as prop or defined in a config file), or use a comment marking this as a demo/single-user mapping to be extended:

```ts
// TODO: Replace with configurable name mapping when multi-user support is added
export function authorName(author: string): string {
  const NAMES: Record<string, string> = {
    "Hermes Agent": "🤖 Hermes",
    "rbnbrls": "Ruben",
    "ruben": "Ruben",
  };
  return NAMES[author] ?? author;
}
```

---

_Reviewed: 2026-07-25T12:00:00Z_
_Reviewer: gsd-code-reviewer (standard depth)_
_Depth: standard_
