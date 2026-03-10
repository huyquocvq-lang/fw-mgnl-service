# ─────────────────────────────────────────────
#  Stage 1: Build
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Copy source and compile TypeScript
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Prune dev-only packages so the final image stays lean
RUN npm prune --production

# ─────────────────────────────────────────────
#  Stage 2: Production image
# ─────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Run as non-root for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Copy compiled output and production node_modules from builder
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json

# Default storage path (override via PACKAGE_STORAGE env or volume mount)
ENV PACKAGE_STORAGE=/data/packages
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Healthcheck: verify the process is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "dist/main"]
