FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json* ./
RUN npm ci

FROM dependencies AS builder
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Install curl for Coolify healthcheck (Coolify runs curl inside the
# container to verify the app is healthy during rolling updates).
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 1001 bcm
COPY --from=builder --chown=bcm:bcm /app/.next/standalone ./
COPY --from=builder --chown=bcm:bcm /app/.next/static ./.next/static
COPY --from=builder --chown=bcm:bcm /app/public ./public
COPY --from=builder --chown=bcm:bcm /app/scripts ./scripts
COPY --from=builder --chown=bcm:bcm /app/package.json ./package.json
USER bcm
EXPOSE 3000
# Give the app 60s to start before Docker considers it unhealthy.
# The script itself auto-restarts on crash so a single blip doesn't
# trigger a Coolify restart loop.
HEALTHCHECK --start-period=60s --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', r => process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "scripts/startup.mjs"]
