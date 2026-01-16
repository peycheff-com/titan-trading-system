# ============================================================================
# Titan Brain - Phase 5 Orchestrator
# Multi-stage Docker build for production deployment
# ============================================================================

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY services/titan-brain/package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY services/titan-brain/tsconfig.json ./
COPY services/titan-brain/src/ ./src/

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache \
    curl \
    postgresql-client \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S titan && \
    adduser -S titan -u 1001 -G titan

# Copy package files
COPY services/titan-brain/package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy configuration files if they exist
COPY services/titan-brain/config.schema.json* ./
COPY services/titan-brain/config.example.json* ./

# Create directories for logs and data
RUN mkdir -p /app/logs /app/data && \
    chown -R titan:titan /app

# Switch to non-root user
USER titan

# Expose the webhook server port
EXPOSE 3100

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3100/status || exit 1

# Environment variables with defaults
ENV NODE_ENV=production \
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=3100 \
    LOG_LEVEL=info

# Start the application
CMD ["node", "dist/index.js"]
