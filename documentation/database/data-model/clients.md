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
| `regeling_type_id` | `uuid` | `REFERENCES regeling_types(id)` | Pension scheme arrangement type (3NF: FK replaces free-text `regeling_type`). |
| `asset_class_id` | `uuid` | `REFERENCES asset_classes(id)` | Default asset class classification (3NF: FK replaces free-text `asset_class`). |
| `status` | `text` | `NOT NULL, DEFAULT 'active'` | Client status. Currently all rows are `active`. |
| `created_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Record creation timestamp. |

# 3NF Changes

**Resolved violations:** `asset_class` (free text, no FK) → FK to `asset_classes`; `regeling_type` (free text, no FK/CHECK) → FK to `regeling_types`.

**Changed columns:**
| Old | New | Rationale |
|-----|-----|-----------|
| `asset_class` `text` | removed | 3NF: free text with no referential integrity |
| `regeling_type` `text` | removed | 3NF: free text with no referential integrity |
| (none) | `regeling_type_id uuid REFERENCES regeling_types(id)` | FK to new lookup table |
| (none) | `asset_class_id uuid REFERENCES asset_classes(id)` | FK to existing lookup table |

# Relationships

- One-to-many with [portfolios](portfolios.md) via `portfolios.client_id`
- One-to-many with [change_requests](change-requests.md) via `change_requests.client_id`
- Many-to-one with [regeling_types](regeling-types.md) via `regeling_type_id`
- Many-to-one with [asset_classes](asset-classes.md) via `asset_class_id`

# Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_clients_asset_class_id` | `asset_class_id` | FK: filter/lookup by asset class |
| `idx_clients_regeling_type_id` | `regeling_type_id` | FK: filter/lookup by regeling type |
| (implicit) | `name` | UNIQUE constraint |
| (implicit) | `external_reference` | UNIQUE constraint |

The `UNIQUE` constraints on `name` and `external_reference` are backed by unique indexes.

# Seed Data

Two pension fund clients are seeded:

| id | name | external_reference |
|----|------|--------------------|
| `9f9280fc-9572-49d1-b81c-2a039652bc93` | Pensioenfonds Horizon | PF-HOR-001 |
| `7b9303c1-3a0d-4398-a5c2-740ea76dfe37` | Stichting Pensioen Zeker | PF-ZEK-002 |

Both have NULL `asset_class_id` and `regeling_type_id` in the seed data (optional fields).

# Usage

The `clients` table is the root entity in the client configuration hierarchy. Most API endpoints filter by `client_id`. The `getClientConfigs()` query in `lib/db.ts` joins `clients` → `portfolios` → `benchmark_catalog` to build the full client configuration tree.

# Citations

[1] [init.sql — clients table](/db/init.sql)
[2] [3NF Schema Design — clients](/documentation/database/data-model/3nf-schema-design.md)
