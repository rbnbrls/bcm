---
type: Schema Design
title: 3NF Schema Design
description: Third Normal Form compliant database redesign for BCM — resolves 8 transitive dependency violations across 6 tables by introducing 3 new lookup tables and foreign key constraints.
tags: [3nf, normalization, migration, schema-design]
timestamp: 2026-07-27T00:00:00Z
---

# 3NF Schema Design

**Status:** Implemented (see `db/init.sql` and `scripts/migrate.mjs`)
**Scope:** All 20 tables in the BCM PostgreSQL schema

---

## Overview

The BCM database schema was analyzed for third normal form (3NF) compliance against its 17 business tables (excluding `_prisma_migrations`). The analysis identified **8 transitive dependency violations** spread across 6 tables, all caused by redundant free-text columns that duplicated values stored in existing or newly created lookup tables.

This document describes the 3NF-compliant redesign, the new lookup tables, the column changes, and the migration approach.

---

## Violations Identified

| # | Table | Column(s) | Problem | Severity |
|---|-------|-----------|---------|----------|
| 1 | `portfolios` | `asset_class`, `sub_asset_class` | Redundant text duplicating `asset_classes` lookup; `sub_asset_class` had no FK at all | Critical |
| 2 | `clients` | `asset_class`, `regeling_type` | Free text with no FK or CHECK constraint | Medium |
| 3 | `benchmark_catalog` | `asset_class` | Text duplicated `asset_classes.name` values with no FK | High |
| 4 | `new_benchmark_requests` | `asset_class` | Same pattern as `benchmark_catalog` | High |
| 5 | `change_requests` | `change_type` | Redundant with `change_type_id` FK — update anomaly if `change_type_config.name` changed | High |
| 6 | `notification_config` | `stakeholder` | Free text with no FK — duplicate spellings across tables | Low |
| 7 | `notification_log` | `stakeholder` | Same pattern as `notification_config` | Low |
| 8 | `clients` | `asset_class` domain mismatch | English codes stored in `asset_class` while `asset_classes` uses Dutch names | Medium |

---

## New Lookup Tables

### 1. `regeling_types`

Replaces the free-text `clients.regeling_type` column.

```sql
CREATE TABLE regeling_types (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Seed data:** 4 arrangement types — pensioenuitkering, premieovereenkomst, kapitaalovereenkomst, uitkeringsovereenkomst.

### 2. `sub_asset_classes`

Replaces the free-text `portfolios.sub_asset_class` column. Each sub-asset class is scoped to a parent asset class.

```sql
CREATE TABLE sub_asset_classes (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  asset_class_id uuid NOT NULL REFERENCES asset_classes(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Seed data:** 10 sub-classes across 4 asset classes (Aandelen, Obligaties, Alternatieven, Vastgoed).

### 3. `stakeholders`

Replaces the free-text `notification_config.stakeholder` and `notification_log.stakeholder` columns.

```sql
CREATE TABLE stakeholders (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Seed data:** 8 stakeholder roles (Portefeuillebeheerder, Risk manager, Fiduciair manager, Klant, Compliance, Juridisch, Financieel adviseur, Beleggingscommissie).

---

## Column Changes

### `asset_classes` enhancement

Added a `code` column to `asset_classes` to reconcile the bilingual naming issue:

```sql
ALTER TABLE asset_classes ADD COLUMN code text NOT NULL UNIQUE;
```

This provides an English machine-readable identifier (e.g., `EQUITIES`, `FIXED_INCOME`) alongside the Dutch display name (`Aandelen`, `Obligaties`), allowing both the existing TypeScript enum-style codes and the Dutch UI labels to coexist.

### Tables with FK additions

| Table | New FK Column | References | Nullable | Old Text Column Kept? |
|-------|---------------|------------|----------|----------------------|
| `portfolios` | `asset_class_id` | `asset_classes(id)` | NOT NULL | Yes (backward compat) |
| `portfolios` | `sub_asset_class_id` | `sub_asset_classes(id)` | YES | Yes (backward compat) |
| `clients` | `regeling_type_id` | `regeling_types(id)` | YES | Yes (backward compat) |
| `clients` | `asset_class_id` | `asset_classes(id)` | YES | Yes (backward compat) |
| `benchmark_catalog` | `asset_class_id` | `asset_classes(id)` | YES | Yes (backward compat) |
| `new_benchmark_requests` | `asset_class_id` | `asset_classes(id)` | YES | Yes (backward compat) |
| `change_requests` | `change_type_id` | `change_type_config(id)` | NOT NULL (was nullable) | Yes (backward compat) |
| `notification_config` | `stakeholder_id` | `stakeholders(id)` | YES | Yes (backward compat) |
| `notification_log` | `stakeholder_id` | `stakeholders(id)` | YES | Yes (backward compat) |

### Indexes added

```sql
-- portfolios
CREATE INDEX idx_p_asset_class_id ON portfolios (asset_class_id);
CREATE INDEX idx_p_sub_asset_class_id ON portfolios (sub_asset_class_id);

-- clients
CREATE INDEX idx_clients_asset_class_id ON clients (asset_class_id);
CREATE INDEX idx_clients_regeling_type_id ON clients (regeling_type_id);

-- benchmark_catalog
CREATE INDEX idx_bc_asset_class_id ON benchmark_catalog (asset_class_id);

-- new_benchmark_requests
CREATE INDEX idx_nbr_asset_class_id ON new_benchmark_requests (asset_class_id);

-- sub_asset_classes
CREATE INDEX idx_sub_ac_asset_class_id ON sub_asset_classes (asset_class_id);

-- notification tables
CREATE INDEX idx_nc_stakeholder_id ON notification_config (stakeholder_id);
CREATE INDEX idx_nl_stakeholder_id ON notification_log (stakeholder_id);
```

### Unique partial index for notification config dedup

```sql
CREATE UNIQUE INDEX idx_notif_config_app
  ON notification_config (stakeholder_id, channel)
  WHERE change_request_id IS NULL;
```

This prevents duplicate global notification configurations for the same stakeholder+channel combination while allowing per-change-request overrides.

---

## Application Code Updates

The following application functions were updated to populate FK columns during writes:

| Function | File | Change |
|----------|------|--------|
| `insertBenchmarksBulk` | `lib/db.ts` | Map `asset_class` → `asset_class_id` via `asset_classes.code` lookup |
| `insertBenchmark` | `lib/db.ts` | Map `asset_class` → `asset_class_id` |
| `insertClient` | `lib/db.ts` | Map `regeling_type` → `regeling_type_id`, `asset_class` → `asset_class_id` |
| `updateClientAssetClass` | `lib/db.ts` | Map `asset_class` → `asset_class_id` |
| `saveNewBenchmarkRequest` | `lib/db.ts` | Map `asset_class` → `asset_class_id` |
| `saveNotificationConfig` | `lib/db.ts` | Map `stakeholder` → `stakeholder_id` |
| `logNotificationDelivery` | `lib/db.ts` | Map `stakeholder` → `stakeholder_id` |
| `ensureReadTables` | `lib/db.ts` | Schema evolution: create new lookup tables if missing |

---

## Migration Strategy

The migration follows a dual-write pattern for zero-downtime compatibility:

1. **Phase 1 — Schema evolution** (idempotent DDL):
   - Create the 3 new lookup tables (`regeling_types`, `sub_asset_classes`, `stakeholders`)
   - Add `code` column to `asset_classes`
   - Add FK columns to each affected table (nullable initially)
   - Create matching indexes

2. **Phase 2 — Data backfill** (one-time migration):
   - Seed new lookup tables from existing distinct values
   - Populate FK columns by matching on text value
   - Add NOT NULL constraints where possible

3. **Phase 3 — Application update** (code changes):
   - Update all write paths to populate FK columns
   - Translate enum-style asset class codes to asset_classes.code match

4. **Phase 4 — Legacy column deprecation** (future):
   - Once all consumers are migrated, legacy text columns can be dropped
   - Requires verifying no queries still reference them

---

## Design Trade-offs

1. **Legacy columns retained** — Free-text columns are kept (marked with `-- Legacy` comments) to avoid breaking existing queries and reports during the transition. They will be removed in a future cleanup phase.

2. **`change_requests.change_type_id` made NOT NULL** — Unlike other nullable FK columns, this one was promoted from nullable to NOT NULL because every change request must have a valid type. The migration backfills any NULL rows first.

3. **`asset_class_id` is NOT NULL on `portfolios` and `benchmark_catalog`** — These represent core classifications that every portfolio and benchmark must have. Other tables (`clients`, `new_benchmark_requests`) keep it nullable because not all clients or benchmark requests have a defined asset class.

4. **JSONB columns preserved** — The 8× 1NF violations in `change_type_config` (`fields`, `stakeholders`, `process_flow`, `cost`, `ist_soll_mapping`) and `change_requests` (`fields`, `stakeholders`) are deliberately kept as JSONB. Normalizing these would require 5+ child tables and break the generic change-type model's extensibility. This is an accepted flexibility-vs-consistency trade-off.

---

## Verification

The migration was verified by:

1. **TypeScript compilation** — `npx tsc --noEmit` passes with no errors
2. **Node.js syntax check** — `node -c scripts/migrate.mjs` (and all updated modules)
3. **Next.js production build** — `next build` succeeds
4. **Manual testing** — Seed data loads correctly, FK relationships are enforced

---

## Citations

[1] [Normalization Analysis](normalization-analysis.md) — Original 1NF/2NF/3NF analysis with all 14 violations
[2] [init.sql — full schema](/db/init.sql) — Single source of truth for the implemented schema
[3] [Test plan](/home/hermes/.hermes/kanban/boards/code/attachments/t_e8c25531/3nf-migration-test-plan.md) — Manual test plan for the 3NF migration
