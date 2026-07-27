# Database

## Overview

PostgreSQL database documentation for the BCM application.

### Topics

| Topic | Description |
|-------|-------------|
| [Data Model](data-model/) | Full OKF-conformant data model documentation |
| Schema file | `db/init.sql` (single source of truth) |
| Migration scripts | `scripts/migrate.mjs` |
| Seed data | `scripts/seed.mjs` |
| Backup procedures | `scripts/backup.mjs` |

### Data Model

The [data model documentation](data-model/) describes all 20 tables in OKF format, including:

- Full schema with column types and constraints
- Entity-relationship diagram (Mermaid)
- Index inventory with performance rationale
- Foreign key relationships with delete rules
- CHECK constraints and data integrity rules
- SLA trigger and computation logic
- Seed data listings

Each table is documented as a standalone OKF concept document with YAML frontmatter (`type: PostgreSQL Table`) and structured body sections.
