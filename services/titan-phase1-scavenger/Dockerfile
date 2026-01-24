# ============================================================================
# Titan Scavenger - Market Microstructure Engine
# Multi-stage Docker build for production deployment
# ============================================================================

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy root package files for resolution
COPY package*.json ./
COPY tsconfig.json ./

# Copy all workspaces for npm workspaces resolution
COPY services/ ./services/

# Install all dependencies (monorepo)
RUN npm ci

# Build the shared package first
WORKDIR /app/services/shared
RUN npm run build

# Build the application
WORKDIR /app/services/titan-phase1-scavenger
RUN npm run build

# Prune dev dependencies for production image
WORKDIR /app
RUN npm prune --omit=dev --workspaces

# Ensure workspace node_modules exist for copy
RUN mkdir -p /app/services/titan-phase1-scavenger/node_modules /app/services/shared/node_modules

# Stage 2: Production
FROM node:22-alpine AS production

WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache \
    curl \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S titan && \
    adduser -S titan -u 1001 -G titan

# Copy root package files for workspace resolution
COPY package*.json ./

# Copy shared workspace package (built)
COPY --from=builder /app/services/shared/ ./services/shared/

# Copy service package files
COPY services/titan-phase1-scavenger/package*.json ./services/titan-phase1-scavenger/

# Copy pruning production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/titan-phase1-scavenger/node_modules ./services/titan-phase1-scavenger/node_modules
COPY --from=builder /app/services/shared/node_modules ./services/shared/node_modules

# Copy built application from builder stage
COPY --from=builder /app/services/titan-phase1-scavenger/dist ./services/titan-phase1-scavenger/dist

# Create directories for logs and data
RUN mkdir -p /app/logs /app/data && \
    chown -R titan:titan /app

# Switch to non-root user
USER titan

WORKDIR /app/services/titan-phase1-scavenger

ENV NODE_ENV=production
ENV PORT=8081

EXPOSE 8081

# Health check using curl (installed in prod stage)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8081/health || exit 1

CMD ["node", "dist/index.js"]
