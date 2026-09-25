# =============================================================================
# Layer strategy:
#   base         → Node.js slim image, shared WORKDIR
#   dependencies → Install npm packages (cache key: package.json + lockfile)
#   builder      → Build Next.js standalone output
#   runner       → Minimal production image with curl, app artifacts, HEALTHCHECK
#
# Layer ordering rationale:
#   1. apt-get install (rarely changes) — before COPY from builder layers
#   2. package.json / lockfile — before source code (npm ci cache key)
#   3. Standalone output — before static assets (changes more frequently)
#   4. Static assets — after standalone (rebuilt on every source change)
# =============================================================================

FROM node:22-bookworm-slim AS base
WORKDIR /app

# ---------------------------------------------------------------------------
# dependencies — install npm packages
# ---------------------------------------------------------------------------
FROM base AS dependencies
COPY --link package.json package-lock.json* ./
RUN npm ci

# ---------------------------------------------------------------------------
# builder — compile the Next.js application
# ---------------------------------------------------------------------------
FROM dependencies AS builder

# NEXT_SERVER_ACTIONS_ENCRYPTION_KEY pins the server-actions salt + encryption
# key at BUILD time. Without it, Next.js generates a random key per build, so
# every server action ID changes on every deploy and stale client tabs / cached
# bundles submit IDs the new server does not know -> UnrecognizedActionError.
# Coolify passes this as a build-time env var (--build-arg). We fail the build
# when it is missing so a future misconfigured deploy cannot silently regress
# to random-per-build IDs.
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
ENV NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
RUN test -n "$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY" \
  || (echo "ERROR: NEXT_SERVER_ACTIONS_ENCRYPTION_KEY build arg is required. Set it as a Coolify build-time env var (e.g. \$(openssl rand -base64 32)) so server action IDs stay stable across deploys." >&2 && exit 1)

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# runner — production image
# ---------------------------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Same key as the builder: the standalone server also needs the key at runtime
# to decrypt server-action payloads. Coolify injects it as a build arg; if it
# is ever missing the builder stage already failed, so this is belt & braces.
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
ENV NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY

# Install curl AND wget:
#  - curl: used by the Dockerfile HEALTHCHECK below (exits immediately with
#    the HTTP status code — no Node.js process overhead, no startup delay).
#  - wget: Coolify's HTTP healthcheck (health_check_type=http) injects a
#    `wget -q -O /dev/null http://localhost:3000/api/health` HEALTHCHECK at
#    deploy time which overrides this image's HEALTHCHECK. Without wget the
#    container is reported "exited:unhealthy" even when the app is up
#    ("wget: not found" in deploy logs).
# ca-certificates is required for TLS connections inside the container.
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
    curl ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --system --uid 1001 bcm

COPY --from=builder --chown=bcm:bcm /app/.next/standalone ./
COPY --from=builder --chown=bcm:bcm /app/.next/static ./.next/static
COPY --from=builder --chown=bcm:bcm /app/public ./public
COPY --from=builder --chown=bcm:bcm /app/scripts ./scripts
COPY --from=builder --chown=bcm:bcm /app/package.json ./package.json
# Copy postgres for scripts/migrate.mjs which runs outside Next.js
# (Next.js standalone bundles postgres into server chunks, but the
#  migration script needs it as a standalone package.)
COPY --from=builder --chown=bcm:bcm /app/node_modules/postgres ./node_modules/postgres

USER bcm
EXPOSE 3000

# Use curl against the dedicated health endpoint (/api/health) instead of
# the Node.js HTTP client. curl exits immediately with the response status
# code — no Node.js process startup overhead.
# Start-period is 90s because startup.mjs runs database migrations (and fix
# scripts) before starting the Next.js server.  Migrations can take 30-60s,
# especially on cold DB volumes.  A 30s start-period caused spurious health
# check failures that triggered Coolify container restarts.
HEALTHCHECK --start-period=90s --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "scripts/startup.mjs"]
