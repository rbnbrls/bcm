# BCM Database Schema — Normalization Analysis

**Date:** 2026-07-27
**Scope:** All 13 tables defined in `db/init.sql`
**Target:** 3NF (Third Normal Form) conformance
**Source:** `/home/hermes/code/bcm/db/init.sql` (single source of truth)

---

## Table Overview (13 tables)

| Table | Type | Rows (seed) |
|-------|------|-------------|
| `clients` | Core | 2 |
| `benchmark_catalog` | Core | 17 |
| `wtp_classifications` | Lookup | 3 |
| `asset_classes` | Lookup | 8 |
| `managers` | Lookup | 3 |
| `benchmarks` | Lookup | 3 |
| `portfolios` | Core | 3 |
| `change_requests` | Workflow | — |
| `change_request_items` | Workflow | — |
| `new_benchmark_requests` | Workflow | — |
| `change_type_config` | Config | — |
| `audit_log` | Audit | — |
| `approvals` | Audit | — |
| `status_history` | Audit | — |
| `notification_config` | Notification | — |
| `notification_log` | Notification | — |
| `webhook_configs` | Integration | — |

---

## 1NF Analysis (Atomic Columns)

### Requirement
Every column must contain atomic (indivisible) values. No repeating groups or arrays as column values. Every row must be uniquely identifiable.

### Finding: **Partially compliant — 8 JSONB columns violate atomicity**

All tables pass the uniqueness requirement (all have UUID primary keys). However, several JSONB columns store multi-valued data that should be separate child tables:

| Table | Column | Type | Issue |
|-------|--------|------|-------|
| `change_requests` | `fields` | `jsonb NOT NULL DEFAULT '[]'` | Stores array of `{fieldKey, istValue, sollValue}` objects. **Violation.** Should be `change_request_field_values` table. |
| `change_requests` | `stakeholders` | `jsonb NOT NULL DEFAULT '[]'` | Stores array of `{stakeholderId, contact, notifiedAt}` objects. **Violation.** Should be `change_request_stakeholder_assignments` table. |
| `change_type_config` | `fields` | `jsonb NOT NULL DEFAULT '[]'` | Stores array of `ChangeField` definitions (key, label, type, required, options, etc.). **Violation.** Should be `change_type_fields` table. |
| `change_type_config` | `stakeholders` | `jsonb NOT NULL DEFAULT '[]'` | Stores array of `StakeholderDef` objects. **Violation.** Should be `change_type_stakeholders` table. |
| `change_type_config` | `process_flow` | `jsonb NOT NULL DEFAULT '[]'` | Stores array of `FlowStep` objects. **Violation.** Should be `change_type_process_steps` table. |
| `change_type_config` | `cost` | `jsonb NOT NULL DEFAULT '{}'` | Stores cost model as structured object. **Partial violation.** Contains `{baseCost, costCurrency, perItemCost, description}`. |
| `change_type_config` | `ist_soll_mapping` | `jsonb` (nullable) | Stores array of IST/SOLL mappings. **Violation.** Should be `change_type_mappings` table. |
| `webhook_configs` | `events` | `jsonb NOT NULL DEFAULT '[]'` | Stores array of event type strings. **Violation.** Should be `webhook_event_subscriptions` table. |
| `audit_log` | `diff_snapshot` | `jsonb` (nullable) | Stores semi-structured diff data. ⚠️ **Debatable** — audit snapshots are a legitimate JSONB use case for flexible schema. |

### Assessment
The JSONB violations are **by design** (the generic change-type model explicitly chose JSONB for extensibility). However, this flexibility comes at a cost:
- No referential integrity on `fields`, `stakeholders`, `process_flow`, `cost`, or `ist_soll_mapping`
- Queries that filter inside JSONB arrays cannot use standard B-tree indexes
- Application code must validate structure — no database-enforced schema
- Join-based queries across these relationships require JSONB path operators (slow at scale)

### Recommendation
Strictly, these are 1NF violations. Pragmatically, for small datasets (<50K rows) the performance difference is negligible. However, for a database that may grow, **migrate the generic change-type model to normalized tables** as the primary schema and expose JSONB views for backward compatibility.

---

## 2NF Analysis (Partial Dependencies)

### Requirement
Every non-key column must be fully functionally dependent on the **entire** primary key. (Only relevant for tables with composite candidate keys.)

### Finding: **Fully 2NF compliant**

All 13 tables use a **surrogate UUID primary key** (single-column). There are no composite primary keys in the schema, so partial-key dependencies (the classic 2NF violation) are structurally impossible.

The only composite candidate key is:
- `change_request_items`: `UNIQUE(change_request_id, portfolio_id)` alongside the surrogate `id` PK
  - Non-key columns: `previous_benchmark_id`, `requested_benchmark_id`
  - Both are fully dependent on the full `(change_request_id, portfolio_id)` composite — a benchmark switch is always per-CR × per-portfolio
  - **No partial dependency**

### Assessment
The surrogate-key design makes 2NF violations mechanically impossible. This is by convention, not by analysis — the schema designer chose UUID PKs everywhere, which sidesteps 2NF entirely.

---

## 3NF Analysis (Transitive Dependencies)

### Requirement
Every non-key column must be **non-transitively** dependent on the primary key. If column A determines column B, and column B determines column C, then C should be in a separate table (or B should not exist as a column).

### Finding: **6 transitive dependency violations identified**

---

### ⚠️ Violation 1: `portfolios.asset_class` and `portfolios.sub_asset_class`

```sql
-- Table: portfolios
asset_class_id uuid NOT NULL REFERENCES asset_classes(id),  -- FK to lookup
asset_class    text,                                         -- ⚠️ denormalized
sub_asset_class text,                                        -- ⚠️ denormalized
```

- `asset_class_id` → `asset_classes(name)` → the text in `asset_class` is transitively dependent on `asset_class_id`
- If `asset_classes.name` is updated, `portfolios.asset_class` becomes stale (update anomaly)
- There is also a **domain mismatch**: `asset_classes` contains Dutch values ('Aandelen', 'Obligaties', etc.) while seed data stores English codes ('EQUITIES', 'FIXED_INCOME') in `portfolios.asset_class`
- `sub_asset_class` has no FK at all — arbitrary free text

**Fix:** Remove `asset_class` and `sub_asset_class` from `portfolios`. Derive when needed by joining through `asset_class_id` → `asset_classes.name`. If `sub_asset_class` is a bounded domain, create a `sub_asset_classes` lookup table.

---

### ⚠️ Violation 2: `clients.asset_class`

```sql
asset_class text,  -- ⚠️ denormalized, no FK constraint
```

- The TypeScript `AssetClass` union type lists 15 enum values (CASH, ALTERNATIVES, EQUITIES, etc.)
- Stored as free text with no FK to `asset_classes`
- No CHECK constraint enforcing valid values

**Fix:** Add FK to `asset_classes(id)`. The Dutch `asset_classes` names ('Aandelen', 'Obligaties') need to be reconciled with the English codes. If both are needed, add a `code` column to `asset_classes`.

---

### ⚠️ Violation 3: `clients.regeling_type`

```sql
regeling_type text,  -- ⚠️ free text, no FK, no CHECK
```

- No referential integrity, no type safety
- If regeling types form a bounded domain, this should be a lookup table

**Fix:** Extract `regeling_types` as a lookup table if bounded, or at minimum add a CHECK constraint.

---

### ⚠️ Violation 4: `benchmark_catalog.asset_class`

```sql
asset_class text NOT NULL,  -- ⚠️ text duplication of asset_classes lookup
```

- Stores Dutch asset class names ('Aandelen', 'Obligaties', 'Alternatieven', etc.)
- There is already an `asset_classes` lookup table with these exact values
- No FK constraint — `benchmark_catalog.asset_class` is completely independent
- **Update anomaly:** If an asset class name changes in `asset_classes`, benchmark catalog is unaffected and potentially contradictory

**Fix:** Replace `benchmark_catalog.asset_class` with `asset_class_id uuid REFERENCES asset_classes(id)`.

---

### ⚠️ Violation 5: `new_benchmark_requests.asset_class`

```sql
asset_class text NOT NULL,  -- ⚠️ same issue as benchmark_catalog
```

- Same problem as `benchmark_catalog.asset_class` above
- Denormalized text with no FK constraint

**Fix:** Replace with `asset_class_id uuid REFERENCES asset_classes(id)`.

---

### ⚠️ Violation 6: `change_requests.change_type` alongside `change_type_id`

```sql
change_type    text NOT NULL,                                 -- ⚠️ legacy denormalized value
change_type_id uuid REFERENCES change_type_config(id),        -- FK to config (nullable)
```

- `change_type` is a legacy free-text column (e.g., 'Benchmark Switch')
- `change_type_id` was added later for the generic change-type model
- When `change_type_id` IS set, `change_type` text is transitively dependent on it (change_type_id → change_type_config.name)
- **Update anomaly risk:** if `change_type_config.name` changes, `change_requests.change_type` becomes stale

**Fix:** Make `change_type_id NOT NULL` and remove the redundant `change_type` text column. For existing rows, derive the change type name from `change_type_config`.

---

### ⚠️ Violation 7: `notification_config.stakeholder` / `notification_log.stakeholder`

```sql
-- Both tables duplicate stakeholder info:
notification_config: stakeholder text NOT NULL,
notification_log:    stakeholder text NOT NULL,
```

- Stakeholder names are duplicated across both tables with no FK to a `stakeholders` reference table
- No referential integrity — two tables could use different spellings of the same stakeholder

**Fix:** Create a `stakeholders` reference table and use FK references.

---

## Summary

| Normal Form | Status | Key Issues |
|-------------|--------|------------|
| **1NF** | ⚠️ **8 violations** | JSONB arrays used for multi-valued attributes (fields, stakeholders, events, process flows) in `change_requests`, `change_type_config`, `webhook_configs` |
| **2NF** | ✅ **Clean** | Surrogate UUID PKs make partial dependencies structurally impossible |
| **3NF** | ⚠️ **6 violations** | Denormalized text columns in `portfolios`, `clients`, `benchmark_catalog`, `new_benchmark_requests`, `change_requests`, `notification_config/log` |

### Critical Fixes (data integrity risk)

| # | Table | Column(s) | Issue | Severity |
|---|-------|-----------|-------|----------|
| 1 | `portfolios` | `asset_class`, `sub_asset_class` | Redundant text, update anomaly | **Critical** |
| 2 | `change_requests` | `change_type` | Redundant with `change_type_id`, update anomaly | **High** |
| 3 | `benchmark_catalog` | `asset_class` | Duplicates `asset_classes` lookup, no FK | **High** |
| 4 | `new_benchmark_requests` | `asset_class` | Same pattern, no FK | **High** |
| 5 | `clients` | `asset_class`, `regeling_type` | Free text, no FK/CHECK | **Medium** |
| 6 | `notification_config/log` | `stakeholder` | Duplicate text, no stakeholder lookup | **Low** |

### Design Trade-offs

The JSONB violations in `change_type_config` are **deliberate** — they enable adding new change types without schema migrations. This flexibility-consistency trade-off is acceptable for the current scale. The **3NF violations in `portfolios.asset_class` and `benchmark_catalog.asset_class`** are not deliberate — they are genuine denormalization artifacts that should be cleaned up regardless of scale.

### Notes on naming confusion

- `portfolios.benchmark_id` → `benchmarks(id)` is a **benchmark group** (classification label like 'Benchmark A'), while `portfolios.current_benchmark_id` → `benchmark_catalog(id)` is the actual market index. These serve different purposes, so it's not a normalization issue, but the naming is confusing.
- The code calls `benchmarks` table "BenchmarkGroup" and `benchmark_catalog` table "Benchmark" — the database names are the reverse. This is a naming inconsistency, not a normalization violation.
