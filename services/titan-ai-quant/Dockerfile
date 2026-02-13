# ============================================================================
# Titan AI Quant - Optimization Engine
# Multi-stage Docker build for production deployment
# ============================================================================

# Stage 1: Build
FROM node:25-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy root package files for resolution
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

# Build the application
WORKDIR /app/services/titan-ai-quant
RUN npm run build

# Prune dev dependencies for production image
WORKDIR /app
RUN npm prune --omit=dev --workspaces

# Ensure workspace node_modules exist for copy
RUN mkdir -p /app/services/titan-ai-quant/node_modules /app/packages/shared/node_modules

# Stage 2: Production
FROM node:25-alpine AS production

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
COPY --from=builder /app/packages/shared/ ./packages/shared/

# Copy service package files
COPY services/titan-ai-quant/package*.json ./services/titan-ai-quant/

# Copy pruning production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/titan-ai-quant/node_modules ./services/titan-ai-quant/node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy built application from builder stage
COPY --from=builder /app/services/titan-ai-quant/dist ./services/titan-ai-quant/dist

# Create directories for logs and data
RUN mkdir -p /app/logs /app/data && \
    chown -R titan:titan /app

# Switch to non-root user
USER titan

WORKDIR /app/services/titan-ai-quant

ENV NODE_ENV=production
ENV PORT=8082

EXPOSE 8082

# Health check using curl (installed in prod stage)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8082/health || exit 1

CMD ["node", "dist/server.js"]
