# Generic Change-Type Model — Design Specification

**Status:** Draft for review  
**Reference:** `/home/hermes/code/.worktrees/t_25d06b2e/CHANGE-TYPE-MODEL-SPEC.md` (canonical version)

This document specifies a configurable change-type model that generalises BCM from its current two hardcoded types (`benchmark_switch`, `new_benchmark`) to a data-driven system.

## Summary

A `change_type_config` table stores type definitions as JSONB fields. Each type defines:

| Property | Description |
|----------|-------------|
| **IST/SOLL fields** | Which current/desired state pairs are compared |
| **Cost model** | Base cost + optional per-item cost |
| **Lead time** | Default duration in calendar days |
| **Stakeholders** | Who gets notified, at which trigger point |
| **Workflow** | Reference to a status workflow (state machine) |

Change requests are extended with generic `fields` (IST/SOLL values per change item), `estimatedCost`, `estimatedLeadDays`, and `stakeholders` (assignments).

## Key Design Decisions

- **JSONB for dynamic fields** — avoids schema migrations per new change type
- **Backward-compatible migration** — existing columns kept; new columns are nullable
- **DB as runtime source of truth** — YAML files serve as seed/backup format
- **IST/SOLL mapping explicit** — each change type declares which field pairs form the diff

## Migration Path

- Phase 1: Schema (`change_type_config` table) + seed two types
- Phase 2: Read path — detail page uses generic fields
- Phase 3: Write path — server actions use config for cost/lead time computation
- Phase 4: Admin UI for type management

## Deliverable

See the full specification at:
- `/home/hermes/code/.worktrees/t_25d06b2e/CHANGE-TYPE-MODEL-SPEC.md` (workspace)
- Or ask Hermes to display it with `read_file` from the workspace path above

**Approval requested** — please review the spec and either approve or request changes by commenting on this task.
