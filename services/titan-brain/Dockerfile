# ============================================================================
# Titan Brain - Phase 5 Orchestrator
# Multi-stage Docker build for production deployment
# ============================================================================

# Stage 1: Build
FROM node:25-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy root package files for workspace resolution
COPY package*.json ./
COPY tsconfig.json ./

# Copy all workspaces for npm workspaces resolution
COPY services/ ./services/
COPY packages/ ./packages/

# Install all dependencies (monorepo)
RUN npm ci

# Build the shared package first
WORKDIR /app/packages/shared
RUN npm run build

# Copy titan-brain source code and build
WORKDIR /app/services/titan-brain
# Build TypeScript
RUN npm run build

# Prune dev dependencies for production image
WORKDIR /app
RUN npm prune --omit=dev --workspaces

# Ensure workspace node_modules exist for copy
RUN mkdir -p /app/services/titan-brain/node_modules /app/packages/shared/node_modules

# Stage 2: Production
FROM node:25-alpine AS production

WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache \
    curl \
    postgresql-client \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S titan && \
    adduser -S titan -u 1001 -G titan

# Copy root package files for workspace resolution
COPY package*.json ./

# Copy shared workspace package (built)
COPY --from=builder /app/packages/shared/ ./packages/shared/

# Copy titan-brain package files
COPY services/titan-brain/package*.json ./services/titan-brain/

# Copy pruned production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/titan-brain/node_modules ./services/titan-brain/node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy built application from builder stage
COPY --from=builder /app/services/titan-brain/dist ./services/titan-brain/dist
# Copy schema.sql (not copied by tsc)
COPY services/titan-brain/src/db/schema.sql ./services/titan-brain/dist/src/db/

# Copy configuration files if they exist
COPY services/titan-brain/config.schema.json* ./services/titan-brain/
COPY services/titan-brain/config.example.json* ./services/titan-brain/

# Create directories for logs and data
RUN mkdir -p /app/logs /app/data && \
    chown -R titan:titan /app

# Switch to non-root user
USER titan

WORKDIR /app/services/titan-brain

# Expose the webhook server port
EXPOSE 3100

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=480s --retries=3 \
    CMD curl -f http://localhost:3100/health || exit 1

# Environment variables with defaults
ENV NODE_ENV=production \
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=3100 \
    LOG_LEVEL=info

# Start the application
CMD ["node", "dist/src/index.js"]
