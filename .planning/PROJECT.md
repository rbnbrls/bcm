# BCM — Business Change Management

**Slogan:** First-time-right change requests for investment management.

**Stack:** Next.js 16 / React 19 / TypeScript / PostgreSQL / Zod / Vitest

**URL:** https://bcm.7rb.nl

## Current Milestone

v1.0 — Launch: Export feature, E2E tests, UI polish, deployment hardening.

## Architecture

Next.js App Router with server actions for mutations, `postgres` npm package for DB, Zod for validation, plain CSS for styling. Deployed via Coolify with Docker multi-stage builds.

## Key Decisions

- Dutch language UI throughout
- Standalone Docker output for Coolify deployment
- DB migrations run on container startup (self-healing with retries)
- Fallback to fixture data when DB is unavailable
