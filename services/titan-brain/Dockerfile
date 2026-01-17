# ============================================================================
# Titan Brain - Phase 5 Orchestrator
# Multi-stage Docker build for production deployment
# ============================================================================

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy root package files for workspace resolution
COPY package*.json ./

# Copy shared workspace package
COPY services/shared/ ./services/shared/

# Copy titan-brain package files
COPY services/titan-brain/package*.json ./services/titan-brain/

# Install all dependencies (workspace mode)
RUN npm ci --workspace=services/titan-brain --workspace=services/shared

# Build the shared package first
WORKDIR /app/services/shared
RUN npm run build

# Copy titan-brain source code and build
WORKDIR /app/services/titan-brain
COPY services/titan-brain/tsconfig.json ./
COPY services/titan-brain/src/ ./src/

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:22-alpine AS production

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
COPY --from=builder /app/services/shared/ ./services/shared/

# Copy titan-brain package files
COPY services/titan-brain/package*.json ./services/titan-brain/

# Install production dependencies only (workspace mode)
RUN npm ci --only=production --workspace=services/titan-brain --workspace=services/shared && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/services/titan-brain/dist ./services/titan-brain/dist

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
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3100/health || exit 1

# Environment variables with defaults
ENV NODE_ENV=production \
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=3100 \
    LOG_LEVEL=info

# Start the application
CMD ["node", "dist/index.js"]
