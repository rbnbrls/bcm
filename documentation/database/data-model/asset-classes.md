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
| `name` | `text` | `NOT NULL, UNIQUE` | Asset class name (e.g., "Aandelen"). |
| `created_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Row creation timestamp. |

# Relationships

- One-to-many with [portfolios](portfolios.md) via `portfolios.asset_class_id`

# Seed Data

| Name |
|------|
| Aandelen |
| Obligaties |
| Vastgoed |
| Alternatieven |
| Liquiditeiten |
| Private Equity |
| Infrastructuur |
| Grondstoffen |

# Citations

[1] [init.sql — asset_classes table](/db/init.sql)
