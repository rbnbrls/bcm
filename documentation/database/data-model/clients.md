---
type: PostgreSQL Table
title: clients
description: Pension fund client master data. One row per pension fund managed through the BCM system.
tags: [core, client, master-data]
timestamp: 2026-07-27T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | `PRIMARY KEY` | Globally unique client identifier. |
| `name` | `text` | `NOT NULL, UNIQUE` | Client display name (e.g., "Pensioenfonds Horizon"). |
| `external_reference` | `text` | `NOT NULL, UNIQUE` | External system reference code (e.g., "PF-HOR-001"). |
| `regeling_type` | `text` | | Type of pension scheme arrangement. |
| `asset_class` | `text` | | Default asset class classification. |
| `status` | `text` | `NOT NULL, DEFAULT 'active'` | Client status. Currently all rows are `active`. |
| `created_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Record creation timestamp. |

# Relationships

- One-to-many with [portfolios](portfolios.md) via `portfolios.client_id`
- One-to-many with [change_requests](change-requests.md) via `change_requests.client_id`
- Referenced by [change_type_config](change-type-config.md) as a potential reference table for custom fields

# Indexes

- No dedicated index on `clients` — the table is expected to remain small (~2 rows).
- The `UNIQUE` constraints on `name` and `external_reference` are backed by unique indexes.

# Seed Data

Two pension fund clients are seeded:

| id | name | external_reference |
|----|------|--------------------|
| `9f9280fc-9572-49d1-b81c-2a039652bc93` | Pensioenfonds Horizon | PF-HOR-001 |
| `7b9303c1-3a0d-4398-a5c2-740ea76dfe37` | Stichting Pensioen Zeker | PF-ZEK-002 |

# Usage

The `clients` table is the root entity in the client configuration hierarchy. Most API endpoints filter by `client_id`. The `getClientConfigs()` query in `lib/db.ts` joins `clients` → `portfolios` → `benchmark_catalog` to build the full client configuration tree.

# Citations

[1] [init.sql — clients table](/db/init.sql)
