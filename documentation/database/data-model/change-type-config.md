---
type: PostgreSQL Table
title: change_type_config
description: Generic change-type configuration. Defines custom change types with dynamic fields, cost models, stakeholders, and process flows.
tags: [configuration, change-type, generic-model]
timestamp: 2026-07-27T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | `PRIMARY KEY` | Globally unique identifier. |
| `slug` | `text` | `NOT NULL, UNIQUE` | URL-friendly identifier for the change type. |
| `name` | `text` | `NOT NULL` | Display name for the change type. |
| `description` | `text` | `NOT NULL, DEFAULT ''` | Description of the change type. |
| `category` | `text` | `NOT NULL, DEFAULT 'general'` | Grouping category. |
| `fields` | `jsonb` | `NOT NULL, DEFAULT '[]'` | Array of field definitions (key, label, type, validation rules). |
| `ist_soll_mapping` | `jsonb` | | Mapping between "ist" (current) and "soll" (target) field names. |
| `cost` | `jsonb` | `NOT NULL, DEFAULT '{}'` | Cost model configuration (base cost, per-item cost, description). |
| `default_lead_days` | `integer` | `NOT NULL, DEFAULT 5` | Default lead time in days for this change type. |
| `stakeholders` | `jsonb` | `NOT NULL, DEFAULT '[]'` | Stakeholder definitions with notification triggers. |
| `workflow` | `text` | `NOT NULL, DEFAULT 'default'` | Workflow identifier. |
| `process_flow` | `jsonb` | `NOT NULL, DEFAULT '[]'` | Ordered list of process flow steps. |
| `active` | `boolean` | `NOT NULL, DEFAULT true` | Whether this change type is available for use. |
| `sort_order` | `integer` | `NOT NULL, DEFAULT 0` | Display sort order in the UI. |
| `created_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Record creation timestamp. |
| `updated_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Last update timestamp. |

# Relationships

- One-to-many with [change_requests](change-requests.md) via `change_requests.change_type_id` (SET NULL on delete)

# Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_ctc_active` | `active` | Filter active change types |
| `idx_ctc_slug` | `slug` | Fast lookup by URL-friendly slug |

# JSONB Structure

The `fields` column contains an array of field definition objects:

```json
[
  {
    "key": "new_benchmark_name",
    "label": "Nieuwe benchmark naam",
    "type": "text",
    "required": true,
    "minLength": 2,
    "maxLength": 100,
    "helpText": "Vul de volledige naam in"
  }
]
```

Supported field types: `benchmark`, `text`, `longtext`, `number`, `currency`, `date`, `select`, `multiselect`, `boolean`.

# Usage

This table enables the generic change-type model (Phase 1+). Instead of hard-coding benchmark switches, new benchmark requests, and fee changes as separate flows, the system reads the configuration from this table. New change types can be added by inserting a row — no schema migration required.

# Citations

[1] [init.sql — change_type_config table](/db/init.sql)
[2] [lib/types.ts — ChangeField, ChangeTypeConfig types](/lib/types.ts)
