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
RUN useradd --system --uid 1001 bcm
COPY --from=builder --chown=bcm:bcm /app/.next/standalone ./
COPY --from=builder --chown=bcm:bcm /app/.next/static ./.next/static
COPY --from=builder --chown=bcm:bcm /app/public ./public
USER bcm
EXPOSE 3000
CMD ["node", "server.js"]
