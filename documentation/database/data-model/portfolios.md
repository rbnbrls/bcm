---
type: PostgreSQL Table
title: portfolios
description: Client portfolio definitions. Each portfolio tracks against a current benchmark and can be switched via change requests.
tags: [core, portfolio, client]
timestamp: 2026-07-27T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | `PRIMARY KEY` | Globally unique portfolio identifier. |
| `client_id` | `uuid` | `NOT NULL, REFERENCES clients(id) ON DELETE CASCADE` | Owning client. |
| `name` | `text` | `NOT NULL` | Portfolio display name (e.g., "Rendementsportefeuille"). |
| `external_reference` | `text` | `NOT NULL` | External system reference (e.g., "HOR-RP"). |
| `current_benchmark_id` | `uuid` | `NOT NULL, REFERENCES benchmark_catalog(id) ON DELETE RESTRICT` | The portfolio's current benchmark index. |
| `currency` | `text` | `NOT NULL, DEFAULT 'EUR'` | Base currency for the portfolio. |
| `active` | `boolean` | `NOT NULL, DEFAULT true` | Whether the portfolio is active and visible in the UI. |

# Constraints

- `UNIQUE (client_id, external_reference)` — A client cannot have two portfolios with the same external reference.

# Relationships

- Many-to-one with [clients](clients.md) via `client_id` (cascading delete)
- Many-to-one with [benchmark_catalog](benchmark-catalog.md) via `current_benchmark_id` (restrict on delete)
- One-to-many with [change_request_items](change-request-items.md) via `change_request_items.portfolio_id`

# Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_p_client_id` | `client_id` | Fast lookup of all portfolios for a client |
| `idx_p_active` | `active` | Filter active/inactive portfolios |
| `idx_p_client_active_name` | `(client_id, active, name)` | Composite: list active portfolios for a client, sorted by name |

# Seed Data

Three portfolios are seeded:

| Name | Client | Benchmark |
|------|--------|-----------|
| Rendementsportefeuille (HOR-RP) | Pensioenfonds Horizon | MSCI World Net Return |
| Matchingportefeuille (HOR-MP) | Pensioenfonds Horizon | Bloomberg Euro Aggregate |
| Return portefeuille (ZEK-RET) | Stichting Pensioen Zeker | MSCI ACWI Net Return |

# Citations

[1] [init.sql — portfolios table](/db/init.sql)
