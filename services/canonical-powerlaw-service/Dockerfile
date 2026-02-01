FROM node:22-slim AS builder

WORKDIR /app

# Copy workspace config
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/canonical-powerlaw-service/package.json ./services/canonical-powerlaw-service/

# Install dependencies
RUN npm ci --workspace=packages/shared --workspace=services/canonical-powerlaw-service --include-workspace-root

# Copy source
COPY packages/shared ./packages/shared
COPY services/canonical-powerlaw-service ./services/canonical-powerlaw-service

# Build shared first
WORKDIR /app/packages/shared
RUN npm run build

# Build service
WORKDIR /app/services/canonical-powerlaw-service
RUN npm run build

# --- Production stage ---
FROM node:22-slim

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/services/canonical-powerlaw-service/dist ./services/canonical-powerlaw-service/dist
COPY --from=builder /app/services/canonical-powerlaw-service/package.json ./services/canonical-powerlaw-service/

# Copy workspace config
COPY package.json package-lock.json ./

# Install production deps only
RUN npm ci --workspace=packages/shared --workspace=services/canonical-powerlaw-service --include-workspace-root --omit=dev

# Create data directory
RUN mkdir -p /data

ENV NODE_ENV=production
ENV HTTP_PORT=8080

EXPOSE 8080

WORKDIR /app/services/canonical-powerlaw-service

CMD ["node", "dist/index.js"]
