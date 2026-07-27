---
type: PostgreSQL Table
title: benchmarks (lookup)
description: Lookup table for benchmark group categories — mandatory attribute for portfolios. Distinct from benchmark_catalog which stores detailed benchmark pricing and provider info.
tags: [lookup, portfolio, benchmark]
timestamp: 2026-07-27T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | `PRIMARY KEY` | Unique identifier. |
| `name` | `text` | `NOT NULL, UNIQUE` | Benchmark group name (e.g., "Benchmark A"). |
| `created_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Row creation timestamp. |

# Relationships

- One-to-many with [portfolios](portfolios.md) via `portfolios.benchmark_id`

# Seed Data

| Name |
|------|
| Benchmark A |
| Benchmark B |
| Benchmark C |

# Notes

This table (plural `benchmarks`) is a simple reference/lookup table for categorizing portfolios by benchmark group. It is separate from `benchmark_catalog` (singular) which stores the detailed benchmark definitions with pricing, providers, and performance data.

# Citations

[1] [init.sql — benchmarks table](/db/init.sql)
