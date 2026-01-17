# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./
COPY services/titan-ai-quant/package.json services/titan-ai-quant/
COPY services/shared services/shared/

# Install dependencies
RUN npm ci --workspace=services/titan-ai-quant --workspace=services/shared

# Copy source code
COPY services/titan-ai-quant services/titan-ai-quant/

# Build shared package first (required for workspace imports)
WORKDIR /app/services/shared
RUN npm run build

# Build the application
WORKDIR /app/services/titan-ai-quant
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy built application and production dependencies
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/services/titan-ai-quant/package.json services/titan-ai-quant/
COPY --from=builder /app/services/titan-ai-quant/dist services/titan-ai-quant/dist/
COPY --from=builder /app/services/shared services/shared/

# Install production dependencies only
RUN npm ci --workspace=services/titan-ai-quant --workspace=services/shared --omit=dev

WORKDIR /app/services/titan-ai-quant

ENV NODE_ENV=production
ENV PORT=8082

EXPOSE 8082

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:8082/health || exit 1

CMD ["node", "dist/server.js"]
