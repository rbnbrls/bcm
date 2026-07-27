---
type: PostgreSQL Table
title: portfolios
description: Client portfolio definitions. Each portfolio tracks against a current benchmark, has mandatory attribute classifications (WTP, asset class, manager, benchmark group), and can be switched via change requests.
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
| `wtp_classification_id` | `uuid` | `NOT NULL, REFERENCES wtp_classifications(id)` | WTP classificatie (Rendement / Matching / Opbouw). |
| `asset_class_id` | `uuid` | `NOT NULL, REFERENCES asset_classes(id)` | Asset class categorization. |
| `manager_id` | `uuid` | `NOT NULL, REFERENCES managers(id)` | Responsible manager. |
| `benchmark_id` | `uuid` | `NOT NULL, REFERENCES benchmarks(id)` | Benchmark group assignment. |
| `currency` | `text` | `NOT NULL, DEFAULT 'EUR'` | Base currency for the portfolio. |
| `active` | `boolean` | `NOT NULL, DEFAULT true` | Whether the portfolio is active and visible in the UI. |
| `asset_class` | `text` | | Canonical asset class key (e.g., `EQUITIES`, `FIXED_INCOME`). Values from the 8-class hierarchy defined in `lib/asset-classes.ts`. |
| `sub_asset_class` | `text` | | Canonical sub asset class value (e.g., `AC WORLD`, `SOVEREIGN EUROPE`). Must be a valid subclass for the selected `asset_class` per `ASSET_CLASS_SUB_CLASSES` in `lib/asset-classes.ts`. |

# Constraints

- `UNIQUE (client_id, external_reference)` — A client cannot have two portfolios with the same external reference.

# Relationships

- Many-to-one with [clients](clients.md) via `client_id` (cascading delete)
- Many-to-one with [benchmark_catalog](benchmark-catalog.md) via `current_benchmark_id` (restrict on delete)
- Many-to-one with [wtp_classifications](wtp-classifications.md) via `wtp_classification_id`
- Many-to-one with [asset_classes](asset-classes.md) via `asset_class_id`
- Many-to-one with [managers](managers.md) via `manager_id`
- Many-to-one with [benchmarks](benchmarks.md) via `benchmark_id`
- One-to-many with [change_request_items](change-request-items.md) via `change_request_items.portfolio_id`

# Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_p_client_id` | `client_id` | Fast lookup of all portfolios for a client |
| `idx_p_wtp_classification_id` | `wtp_classification_id` | Filter by WTP classification |
| `idx_p_asset_class_id` | `asset_class_id` | Filter by asset class |
| `idx_p_manager_id` | `manager_id` | Filter by manager |
| `idx_p_benchmark_id` | `benchmark_id` | Filter by benchmark group |
| `idx_p_active` | `active` | Filter active/inactive portfolios |
| `idx_p_client_active_name` | `(client_id, active, name)` | Composite: list active portfolios for a client, sorted by name |

# Seed Data

Three portfolios are seeded:

| Name | Client | Benchmark | WTP | Asset Class | Manager |
|------|--------|-----------|-----|-------------|---------|
| Rendementsportefeuille (HOR-RP) | Pensioenfonds Horizon | MSCI World Net Return | Rendement | Aandelen | Eigen beheer |
| Matchingportefeuille (HOR-MP) | Pensioenfonds Horizon | Bloomberg Euro Aggregate | Matching | Obligaties | Eigen beheer |
| Return portefeuille (ZEK-RET) | Stichting Pensioen Zeker | MSCI ACWI Net Return | Rendement | Aandelen | Externe beheerder A |

# Citations

[1] [init.sql — portfolios table](/db/init.sql)
