# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./
COPY services/titan-phase1-scavenger/package.json services/titan-phase1-scavenger/
COPY services/shared services/shared/

# Install dependencies
RUN npm ci --workspace=services/titan-phase1-scavenger --workspace=services/shared

# Copy source code
COPY services/titan-phase1-scavenger services/titan-phase1-scavenger/

# Build the application
WORKDIR /app/services/titan-phase1-scavenger
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built application and production dependencies
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/services/titan-phase1-scavenger/package.json services/titan-phase1-scavenger/
COPY --from=builder /app/services/titan-phase1-scavenger/dist services/titan-phase1-scavenger/dist/
COPY --from=builder /app/services/shared services/shared/

# Install production dependencies only
RUN npm ci --workspace=services/titan-phase1-scavenger --workspace=services/shared --omit=dev

WORKDIR /app/services/titan-phase1-scavenger

ENV NODE_ENV=production
ENV PORT=8081

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:8081/health || exit 1

CMD ["node", "dist/index.js"]
