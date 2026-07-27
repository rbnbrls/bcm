---
type: PostgreSQL Table
title: stakeholders
description: Lookup table for stakeholder roles — replaces free-text stakeholder references in notification_config and notification_log.
tags: [lookup, notification, stakeholder]
timestamp: 2026-07-27T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | `PRIMARY KEY` | Unique identifier. |
| `name` | `text` | `NOT NULL, UNIQUE` | Stakeholder name (e.g., "Portefeuillebeheerder"). |
| `created_at` | `timestamptz` | `NOT NULL, DEFAULT now()` | Row creation timestamp. |

# Relationships

- One-to-many with [notification_config](notification-config.md) via `notification_config.stakeholder_id`
- One-to-many with [notification_log](notification-log.md) via `notification_log.stakeholder_id`

# 3NF Rationale

The `notification_config.stakeholder` and `notification_log.stakeholder` columns were previously duplicated free text with no FK constraint. Two separate tables could use different spellings of the same stakeholder. Extracting to a lookup table eliminates this update anomaly.

# Seed Data

| Name | Description |
|------|-------------|
| Portefeuillebeheerder | Portfolio manager |
| Risk manager | Risk manager |
| Fiduciair manager | Fiduciary manager |
| Klant | Client / pension fund representative |
| Compliance | Compliance officer |
| Juridisch | Legal counsel |
| Financieel adviseur | Financial advisor |
| Beleggingscommissie | Investment committee |

# Citations

[1] [3NF Schema Design — stakeholders](/documentation/database/data-model/3nf-schema-design.md)
