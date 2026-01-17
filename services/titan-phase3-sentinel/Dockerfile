# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./
COPY services/titan-phase3-sentinel/package.json services/titan-phase3-sentinel/
COPY services/shared services/shared/

# Install dependencies
RUN npm ci --workspace=services/titan-phase3-sentinel --workspace=services/shared

# Copy source code
COPY services/titan-phase3-sentinel services/titan-phase3-sentinel/

# Build shared package first (required for workspace imports)
WORKDIR /app/services/shared
RUN npm run build

# Build the application
WORKDIR /app/services/titan-phase3-sentinel
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy built application and production dependencies
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/services/titan-phase3-sentinel/package.json services/titan-phase3-sentinel/
COPY --from=builder /app/services/titan-phase3-sentinel/dist services/titan-phase3-sentinel/dist/
COPY --from=builder /app/services/shared services/shared/

# Install production dependencies only
RUN npm ci --workspace=services/titan-phase3-sentinel --workspace=services/shared --omit=dev

WORKDIR /app/services/titan-phase3-sentinel

ENV NODE_ENV=production
ENV PORT=8084

EXPOSE 8084

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:8084/health || exit 1

CMD ["node", "dist/index.js"]
