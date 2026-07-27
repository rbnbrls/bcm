# Unresolved Efficiency Review Findings

These findings were identified by the simplify-code efficiency reviewer but
were **not auto-applied** because they carry structural risk (may change
behavior, require public contract changes, or need architectural decisions).

## CRITICAL

### 1. N+1 Correlated Subquery in `getAllChangeRequests`
- **File:** `lib/db.ts:1109,1138,1414`
- **Problem:** Correlated subquery `(SELECT COUNT(*) FROM change_request_items WHERE change_request_id = cr.id)::int AS item_count` runs per-row (501 queries for 500 rows).
- **Suggested fix:** Replace with `LEFT JOIN` + `GROUP BY` or window function.
- **Risk:** RISKY — query restructuring affects all loading paths. Needs thorough test coverage.
- **Found in 3 functions:** `getAllChangeRequests`, `getAllChangeRequestsFull` (retry block), `getChangesByStatus`

### 2. N+8 Row-by-Row Pattern in `upsertClientsPortfolios`
- **File:** `lib/db.ts:1807–1839`
- **Problem:** Up to 3 SELECT + 2 INSERT/UPDATE per CSV row — 2500 round-trips for 500 rows.
- **Suggested fix:** Batch client/benchmark lookups with `ANY()` before the loop.
- **Risk:** RISKY — import correctness depends on this logic.

## HIGH

### 3. `getChangesBySlaStatus` Loads ALL Rows Then Filters in JS
- **File:** `lib/db.ts:1403–1406`
- **Problem:** Calls `getAllChangeRequests()` (full scan), then JS-filters.
- **Suggested fix:** Dedicated SQL with SLA computation pushed to DB.
- **Risk:** CAREFUL — would need push-SLA-to-SQL approach; current `computeSlaStatus` is JS-only.

### 4. Reports API Loads Entire Dataset Then Filters In-Memory
- **File:** `app/api/reports/route.ts:29` → `lib/db.ts:1171–1265`
- **Problem:** Always calls `getAllChangeRequestsFull()` then JS-filters. Transfers all columns for every report.
- **Suggested fix:** Push filters into SQL with dynamic WHERE clauses (postgres.js composable SQL fragments).
- **Risk:** CAREFUL — well-understood pattern, but touches the reports API contract.

### 5. Notification Config Resolution Makes Up to 6 Sequential Queries
- **File:** `lib/notifications.ts:248–313`
- **Problem:** `resolveConfig()` loops over 3 stakeholders, each calling `getNotificationConfigs()` twice.
- **Suggested fix:** One batched query `WHERE stakeholder = ANY(${ids})`.
- **Risk:** CAREFUL — query restructure without contract change.

## MEDIUM

### 6. 320 Lines of Duplicate Retry Boilerplate (8 Functions)
- **File:** `lib/db.ts:46–253`
- **Problem:** Each function repeats the `for (attempt of [1,2]) { try { ... } catch { if (attempt===1) await ensureReadTables(sql); } }` pattern.
- **Suggested fix:** Extract `withTableEnsure<T>(fn, fallback)` helper.
- **Risk:** SAFE (pure refactor) but touches 8 functions in the largest file. Deferred to avoid merge conflicts with concurrent work.

### 7. SLA Status Recomputed Per-Row, Per-Request — No Caching
- **File:** `lib/types.ts:368–390` + 8 call sites
- **Problem:** `computeSlaStatus()` uses `new Date()` on every row. 500 Date computations per request. Causes inconsistent pagination.
- **Suggested fix:** Store as computed column; update on status change or via scheduled job.
- **Risk:** CAREFUL (architectural decision — schema change needed).

---

## Summary

| # | Issue | Risk | Status |
|---|-------|------|--------|
| 1 | N+1 correlated subquery | RISKY | Needs human review |
| 2 | N+8 row-by-row CSV import | RISKY | Needs human review |
| 3 | `getChangesBySlaStatus` loads all rows | CAREFUL | Can apply with test |
| 4 | Reports API loads entire dataset | CAREFUL | Can apply with test |
| 5 | Notification config sequential queries | CAREFUL | Can apply with test |
| 6 | Retry boilerplate (8 functions) | SAFE | Deferred (large refactor) |
| 7 | SLA status recomputed per-row | CAREFUL | Needs architecture decision |

**Already applied in this branch:**
- Silent swallows (.catch logging) — 7 locations across 3 files
- SQL injection fix in `updateChangeStatus` (parameterized queries)
- Status handler redundant DB round trips removed
- Dashboard client useMemo for `totalPending`, `slaAtRisk`, `statusCounts`
- Click-outside ref callback in export-button
