---
type: PostgreSQL Table
title: benchmark_catalog
description: Market benchmark index catalog. Defines available benchmark indices that portfolios can track against.
tags: [core, benchmark, master-data]
timestamp: 2026-07-27T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | `PRIMARY KEY` | Globally unique benchmark identifier. |
| `code` | `text` | `NOT NULL, UNIQUE` | Short mnemonic code (e.g., "MSCI-WORLD-NR"). |
| `name` | `text` | `NOT NULL` | Full display name (e.g., "MSCI World Net Return"). |
| `asset_class_id` | `uuid` | `NOT NULL, REFERENCES asset_classes(id)` | Asset class classification (3NF: FK replaces free-text `asset_class`). |
| `currency` | `text` | `NOT NULL` | Denomination currency (e.g., "EUR", "USD"). |
| `cost` | `numeric(10,2)` | `NOT NULL, DEFAULT 1000.00` | Annual cost in the benchmark's currency. |
| `provider` | `text` | `NOT NULL, DEFAULT 'rimes'` | Data provider (e.g., "MSCI", "Bloomberg", "rimes"). |
| `active` | `boolean` | `NOT NULL, DEFAULT true` | Whether the benchmark is available for new assignments. |
| `lead_weeks` | `integer` | `NOT NULL, DEFAULT 1` | Typical lead time in weeks to activate this benchmark. |

# 3NF Changes

**Resolved violation:** `asset_class` text column duplicated `asset_classes.name` values with no FK constraint — an update anomaly if an asset class name changed.

**Changed columns:**
| Old | New | Rationale |
|-----|-----|-----------|
| `asset_class` `text NOT NULL` | removed | 3NF: text duplicated `asset_classes.name` with no referential integrity |
| (none) | `asset_class_id uuid NOT NULL REFERENCES asset_classes(id)` | FK to asset_classes lookup |

# Relationships

- One-to-many with [portfolios](portfolios.md) via `portfolios.current_benchmark_id` (`ON DELETE RESTRICT`)
- Referenced by [change_request_items](change-request-items.md) as both `previous_benchmark_id` and `requested_benchmark_id` (both `ON DELETE RESTRICT`)
- Many-to-one with [asset_classes](asset-classes.md) via `asset_class_id`

# Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_bc_active` | `active` | Filter only active benchmarks in dropdowns |
| `idx_bc_asset_class_id` | `asset_class_id` | Group/filter by asset class (replaces `idx_bc_asset_class`) |

# Seed Data

17 benchmark indices are seeded covering equities (MSCI World, ACWI, EM, S&P 500), fixed income (Bloomberg Euro Agg, ICE BofA, Bloomberg Global Agg, Euro Govt, Global HY), alternatives (Rimes Private Equity, HFRX Hedge, S&P GSCI), real estate (Global REIT, FTSE EPRA Nareit), and sector benchmarks (MSCI World Infrastructure, MSCI World Health Care).

# Usage

The `benchmark_catalog` is a read-mostly table. Writes occur only during new benchmark setup via `new_benchmark_requests`. The application caches benchmarks in-memory with `getBenchmarks()` for dropdown rendering. The `ON DELETE RESTRICT` constraint prevents deletion of benchmarks that are actively referenced by portfolios or change request items.

# Citations

[1] [init.sql — benchmark_catalog table](/db/init.sql)
[2] [3NF Schema Design — benchmark_catalog](/documentation/database/data-model/3nf-schema-design.md)
