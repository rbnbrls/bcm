# Seed Data

BCM has one standard seed script:

```bash
npm run db:seed
```

This runs `scripts/seed-client-config.mjs` and fills the `client_config` schema
with the standard reference data and portfolio configurations.

## When It Runs

- First start: `scripts/migrate.mjs` calls the same seed function when
  `client_config.portfolio_configuration` is empty.
- Manual use: run `npm run db:seed`.
- Admin reset: the reset seed data action truncates the managed seed tables and
  calls the same seed function through `/api/seed/client-config`.
- Compatibility: `POST /api/seed` delegates to `POST /api/seed/client-config`.

## Seed Contents

The script seeds:

- `client_config.asset_class`
- `client_config.sub_asset_class`
- `client_config.manager`
- `client_config.benchmark`
- `client_config.npc_classification`
- `client_config.parent_account`
- `client_config.client`
- `client_config.portfolio`
- `client_config.portfolio_configuration`

The script is idempotent: records are inserted with conflict handling, so
running it multiple times does not duplicate seed data.

## Source

The source of truth is `scripts/seed-client-config.mjs`. Do not add a second
seed script or duplicate seed data in API routes, migrations or reset actions.
