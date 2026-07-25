# Phase 4: Deployment Hardening — Context

**Gathered:** 2026-07-25
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Harden the BCM deployment pipeline: Docker image optimization, health check reliability, error monitoring, database backup strategy, and CI pipeline improvements.

</domain>

<decisions>
## Implementation Decisions

### the agent's Discretion
All implementation choices are at the agent's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

### Infrastructure
- Multi-stage Dockerfile (Node 22-bookworm, standalone output)
- docker-compose.yml + docker-compose.yaml (Coolify variant)
- HEALTHCHECK with curl, 60s start period
- scripts/startup.mjs (entrypoint with migration retry + auto-restart)
- scripts/migrate.mjs (self-healing DB migration)
- Postgres 17-alpine database container
- Coolify deployment with Traefik + Let's Encrypt
- GitHub Actions: ci.yml (test), deploy.yml (Coolify deploy), ci-failure.yml

### Established Patterns
- Self-healing on startup (retry DB connection, auto-create tables)
- Fixture fallback when DB unavailable
- Coolify deployment via webhook POST

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
