# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY services/titan-phase2-hunter/package.json services/titan-phase2-hunter/
COPY services/shared services/shared/

# Install dependencies
RUN npm ci --workspace=services/titan-phase2-hunter --workspace=services/shared

# Copy source code
COPY services/titan-phase2-hunter services/titan-phase2-hunter/

# Build shared package first (required for workspace imports)
WORKDIR /app/services/shared
RUN npm run build

# Build the application
WORKDIR /app/services/titan-phase2-hunter
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy built application and production dependencies
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/services/titan-phase2-hunter/package.json services/titan-phase2-hunter/
COPY --from=builder /app/services/titan-phase2-hunter/dist services/titan-phase2-hunter/dist/
COPY --from=builder /app/services/shared services/shared/

# Install production dependencies only
RUN npm ci --workspace=services/titan-phase2-hunter --workspace=services/shared --omit=dev

WORKDIR /app/services/titan-phase2-hunter

ENV NODE_ENV=production
ENV PORT=8083

EXPOSE 8083

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:8083/health || exit 1

CMD ["node", "dist/index.js"]
