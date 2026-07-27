---
type: PostgreSQL Table
title: managers
description: Lookup table for portfolio managers — mandatory attribute for portfolios.
tags: [lookup, portfolio, manager]
timestamp: 2026-07-27T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | `PRIMARY KEY` | Unique identifier. |
| `name` | `text` | `NOT NULL, UNIQUE` | Manager name (e.g., "Eigen beheer"). |
| `created_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Row creation timestamp. |

# Relationships

- One-to-many with [portfolios](portfolios.md) via `portfolios.manager_id`

# Seed Data

| Name |
|------|
| Eigen beheer |
| Externe beheerder A |
| Externe beheerder B |

# Citations

[1] [init.sql — managers table](/db/init.sql)
