---
type: PostgreSQL Table
title: notification_config
description: Per-stakeholder notification routing configuration. Defines how and where stakeholders should be notified about change request events.
tags: [notification, configuration, stakeholder]
timestamp: 2026-07-27T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | `PRIMARY KEY` | Globally unique identifier. |
| `stakeholder_id` | `uuid` | `NOT NULL, REFERENCES stakeholders(id)` | Stakeholder role (3NF: FK replaces free-text `stakeholder`). |
| `channel` | `text` | `NOT NULL, CHECK (channel IN ('webhook', 'email'))` | Notification channel. |
| `recipient` | `text` | `NOT NULL` | Destination address (email or webhook URL). |
| `is_active` | `boolean` | `NOT NULL, DEFAULT true` | Whether this config is active. |
| `change_request_id` | `uuid` | `REFERENCES change_requests(id) ON DELETE CASCADE` | Optional: scoped to a specific change request. NULL for global config. |
| `created_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Record creation timestamp. |

# 3NF Changes

**Resolved violation:** `stakeholder` text column had no FK constraint — two tables (notification_config, notification_log) could use different spellings of the same stakeholder.

**Changed columns:**
| Old | New | Rationale |
|-----|-----|-----------|
| `stakeholder` `text NOT NULL` | removed | 3NF: free text with no referential integrity |
| (none) | `stakeholder_id uuid NOT NULL REFERENCES stakeholders(id)` | FK to new stakeholders lookup |

# Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_nc_change_request_id` | `change_request_id` | FK: notification configs by change request |
| `idx_nc_is_active` | `is_active` | Filter active configurations |
| `idx_nc_stakeholder_id` | `stakeholder_id` | FK: filter by stakeholder |
| `idx_notif_config_app` | `(stakeholder_id, channel)` (unique partial) | Prevent duplicates for global configs; `WHERE change_request_id IS NULL` |

# Relationships

- Many-to-one with [change_requests](change-requests.md) via `change_request_id` (nullable, cascading delete)
- Many-to-one with [stakeholders](stakeholders.md) via `stakeholder_id`

# Usage

Notification configs can be either global (applied to all change requests for a stakeholder) or scoped to a specific change request. The `idx_notif_config_app` unique partial index ensures that global configs (where `change_request_id IS NULL`) don't have duplicates. The `notification_log` table tracks actual delivery attempts against these configs.

# Citations

[1] [init.sql — notification_config table](/db/init.sql)
[2] [3NF Schema Design — notification_config](/documentation/database/data-model/3nf-schema-design.md)
