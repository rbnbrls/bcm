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
| `asset_class` | `text` | `NOT NULL` | Asset class classification (e.g., "Aandelen", "Obligaties"). |
| `currency` | `text` | `NOT NULL` | Denomination currency (e.g., "EUR", "USD"). |
| `cost` | `numeric(10,2)` | `NOT NULL, DEFAULT 1000.00` | Annual cost in the benchmark's currency. |
| `provider` | `text` | `NOT NULL, DEFAULT 'rimes'` | Data provider (e.g., "MSCI", "Bloomberg", "rimes"). |
| `active` | `boolean` | `NOT NULL, DEFAULT true` | Whether the benchmark is available for new assignments. |
| `lead_weeks` | `integer` | `NOT NULL, DEFAULT 1` | Typical lead time in weeks to activate this benchmark. |

# Relationships

- One-to-many with [portfolios](portfolios.md) via `portfolios.current_benchmark_id` (`ON DELETE RESTRICT`)
- Referenced by [change_request_items](change-request-items.md) as both `previous_benchmark_id` and `requested_benchmark_id` (both `ON DELETE RESTRICT`)

# Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_bc_active` | `active` | Filter only active benchmarks in dropdowns |
| `idx_bc_asset_class` | `asset_class` | Group/filter by asset class |

# Seed Data

12 benchmark indices are seeded covering equities (MSCI World, ACWI, EM, S&P 500), fixed income (Bloomberg Euro Agg, ICE BofA, Bloomberg Global Agg), alternatives (Rimes Private Equity, HFRX Hedge), real estate (Global REIT), and custom ESG benchmarks.

# Usage

The `benchmark_catalog` is a read-mostly table. Writes occur only during new benchmark setup via `new_benchmark_requests`. The application caches benchmarks in-memory with `getBenchmarks()` for dropdown rendering. The `ON DELETE RESTRICT` constraint prevents deletion of benchmarks that are actively referenced by portfolios or change request items.

# Citations

[1] [init.sql — benchmark_catalog table](/db/init.sql)
