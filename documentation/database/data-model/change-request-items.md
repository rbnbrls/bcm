---
type: PostgreSQL Table
title: change_request_items
description: Per-portfolio additions within a change request. Each item represents switching one portfolio from its previous benchmark to a requested benchmark.
tags: [workflow, change-request, item]
timestamp: 2026-07-27T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | `PRIMARY KEY` | Globally unique item identifier. |
| `change_request_id` | `uuid` | `NOT NULL, REFERENCES change_requests(id) ON DELETE CASCADE` | Parent change request. |
| `portfolio_id` | `uuid` | `NOT NULL, REFERENCES portfolios(id) ON DELETE CASCADE` | Portfolio being switched. |
| `previous_benchmark_id` | `uuid` | `NOT NULL, REFERENCES benchmark_catalog(id) ON DELETE RESTRICT` | Portfolio's benchmark before the change. |
| `requested_benchmark_id` | `uuid` | `NOT NULL, REFERENCES benchmark_catalog(id) ON DELETE RESTRICT` | Requested new benchmark. |

# Constraints

- `UNIQUE (change_request_id, portfolio_id)` — A portfolio can only appear once per change request.

# Relationships

- Many-to-one with [change_requests](change-requests.md) via `change_request_id` (cascading delete)
- Many-to-one with [portfolios](portfolios.md) via `portfolio_id` (cascading delete)
- Many-to-one with [benchmark_catalog](benchmark-catalog.md) as `previous_benchmark_id` (restrict on delete)
- Many-to-one with [benchmark_catalog](benchmark-catalog.md) as `requested_benchmark_id` (restrict on delete)

# Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_cri_change_request_id` | `change_request_id` | FK: items by change request |
| `idx_cri_portfolio_id` | `portfolio_id` | FK: items by portfolio |
| `idx_cri_previous_benchmark_id` | `previous_benchmark_id` | FK: items by previous benchmark |
| `idx_cri_requested_benchmark_id` | `requested_benchmark_id` | FK: items by requested benchmark |

# Usage

A change request of type `benchmark_switch` contains one or more items. Each item records both the previous and requested benchmark, enabling the system to track the before/after state at the portfolio level. The `UNIQUE` constraint ensures a portfolio can't be switched multiple times within the same request.

# Citations

[1] [init.sql — change_request_items table](/db/init.sql)
