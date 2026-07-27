---
type: PostgreSQL Table
title: wtp_classifications
description: Lookup table for WTP classificatie — mandatory classification attribute for portfolios (Rendement, Matching, Opbouw).
tags: [lookup, portfolio, wtp]
timestamp: 2026-07-27T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | `PRIMARY KEY` | Unique identifier. |
| `name` | `text` | `NOT NULL, UNIQUE` | Classification name (e.g., "Rendement"). |
| `created_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Row creation timestamp. |

# Relationships

- One-to-many with [portfolios](portfolios.md) via `portfolios.wtp_classification_id`

# Seed Data

| Name | Description |
|------|-------------|
| Rendement | Return-oriented portfolio classification |
| Matching | Matching / liability-driven classification |
| Opbouw | Accumulation portfolio classification |

# Citations

[1] [init.sql — wtp_classifications table](/db/init.sql)
