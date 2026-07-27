---
type: PostgreSQL Table
title: new_benchmark_requests
description: Sub-requests within a change request for creating entirely new benchmark indices not yet in the benchmark_catalog.
tags: [workflow, change-request, benchmark]
timestamp: 2026-07-27T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | `PRIMARY KEY` | Globally unique identifier. |
| `change_request_id` | `uuid` | `NOT NULL, REFERENCES change_requests(id) ON DELETE CASCADE` | Parent change request. |
| `short_name` | `text` | `NOT NULL` | Short name for the new benchmark. |
| `long_name` | `text` | `NOT NULL` | Full display name for the new benchmark. |
| `asset_class` | `text` | `NOT NULL` | Asset class classification for the new benchmark. |
| `currency` | `text` | `NOT NULL, DEFAULT 'EUR'` | Denomination currency. |
| `estimated_cost` | `numeric(10,2)` | `NOT NULL, DEFAULT 5000.00` | Estimated setup cost for the new benchmark. |
| `estimated_lead_weeks` | `integer` | `NOT NULL, DEFAULT 4` | Estimated lead time in weeks. |

# Relationships

- Many-to-one with [change_requests](change-requests.md) via `change_request_id` (cascading delete)

# Usage

When a change request type is `new_benchmark`, a single `new_benchmark_requests` row describes the benchmark to be created. After processing, the new benchmark is added to `benchmark_catalog` and the portfolio is updated to reference it.

# Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_nbr_change_request_id` | `change_request_id` | FK: request by change request |

# Citations

[1] [init.sql — new_benchmark_requests table](/db/init.sql)
