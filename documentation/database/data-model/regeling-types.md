---
type: PostgreSQL Table
title: regeling_types
description: Lookup table for pension fund arrangement types (regeling types) — replaces free-text regeling_type on clients.
tags: [lookup, client, regeling]
timestamp: 2026-07-27T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | `PRIMARY KEY` | Unique identifier. |
| `name` | `text` | `NOT NULL, UNIQUE` | Short identifier (e.g., "pensioenuitkering"). |
| `description` | `text` | | Optional human-readable description. |
| `created_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Row creation timestamp. |

# Relationships

- One-to-many with [clients](clients.md) via `clients.regeling_type_id`

# 3NF Rationale

The `clients.regeling_type` column was previously free text with no FK constraint, CHECK constraint, or referential integrity. Extracting to a lookup table ensures that arrangement type values are consistent across all client records.

# Seed Data

| Name | Description |
|------|-------------|
| pensioenuitkering | Beschikbare premieregeling — uitkeringsfase |
| premieovereenkomst | Beschikbare premieregeling — opbouwfase |
| kapitaalovereenkomst | Vaste toegezegde kapitaalregeling |
| uitkeringsovereenkomst | Vaste toegezegde uitkeringsregeling (eindloon/middelloon) |

# Citations

[1] [3NF Schema Design — regeling_types](/documentation/database/data-model/3nf-schema-design.md)
