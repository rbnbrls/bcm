---
type: PostgreSQL Table
title: asset_classes
description: Lookup table for asset class categories — mandatory attribute for portfolios.
tags: [lookup, portfolio, asset-class]
timestamp: 2026-07-27T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | `PRIMARY KEY` | Unique identifier. |
| `code` | `text` | `NOT NULL, UNIQUE` | English identifier (e.g., "EQUITIES", "FIXED_INCOME"). |
| `name` | `text` | `NOT NULL, UNIQUE` | Dutch asset class name (e.g., "Aandelen"). |
| `created_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Row creation timestamp. |

# Relationships

- One-to-many with [portfolios](portfolios.md) via `portfolios.asset_class_id`
- One-to-many with [benchmark_catalog](benchmark-catalog.md) via `benchmark_catalog.asset_class_id`
- One-to-many with [new_benchmark_requests](new-benchmark-requests.md) via `new_benchmark_requests.asset_class_id`
- One-to-many with [clients](clients.md) via `clients.asset_class_id`
- One-to-many with [sub_asset_classes](sub-asset-classes.md) via `sub_asset_classes.asset_class_id`

# Seed Data

| Code | Name |
|------|------|
| EQUITIES | Aandelen |
| FIXED_INCOME | Obligaties |
| REAL_ESTATE | Vastgoed |
| ALTERNATIVES | Alternatieven |
| CASH | Liquiditeiten |
| PRIVATE_EQUITY | Private Equity |
| INFRASTRUCTURE | Infrastructuur |
| COMMODITIES | Grondstoffen |

# Citations

[1] [init.sql — asset_classes table](/db/init.sql)
