---
type: PostgreSQL Table
title: sub_asset_classes
description: Lookup table for sub-asset class classifications — replaces free-text sub_asset_class on portfolios, linked to parent asset class.
tags: [lookup, portfolio, asset-class]
timestamp: 2026-07-27T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | `PRIMARY KEY` | Unique identifier. |
| `name` | `text` | `NOT NULL, UNIQUE` | Sub-asset class name (e.g., "AC WORLD"). |
| `asset_class_id` | `uuid` | `NOT NULL, REFERENCES asset_classes(id)` | Parent asset class. |
| `created_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Row creation timestamp. |

# Relationships

- Many-to-one with [asset_classes](asset-classes.md) via `asset_class_id`
- One-to-many with [portfolios](portfolios.md) via `portfolios.sub_asset_class_id`

# Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_sub_ac_asset_class_id` | `asset_class_id` | Fast lookup of sub-classes by parent asset class |

# 3NF Rationale

The `portfolios.sub_asset_class` column was previously free text with no FK constraint. Extracting to a bounded lookup table ensures consistency and enables referential integrity. Each sub-asset class is scoped to a parent asset class.

# Seed Data

| Name | Asset Class |
|------|-------------|
| AC WORLD | Aandelen |
| DEVELOPED MARKETS | Aandelen |
| EMERGING MARKETS | Aandelen |
| SOVEREIGN EUROPE | Obligaties |
| CORPORATE EUROPE | Obligaties |
| GOVERNMENT BONDS | Obligaties |
| HIGH YIELD | Obligaties |
| PRIVATE EQUITY | Alternatieven |
| REAL ESTATE DIRECT | Vastgoed |
| REAL ESTATE INDIRECT | Vastgoed |

# Citations

[1] [3NF Schema Design — sub_asset_classes](/documentation/database/data-model/3nf-schema-design.md)
