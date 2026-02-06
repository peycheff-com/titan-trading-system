# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json package-lock.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY services/titan-console-api/package.json services/titan-console-api/

# Install dependencies
RUN npm ci --workspace=packages/shared --workspace=services/titan-console-api

# Copy source code
COPY packages/shared packages/shared/
COPY services/titan-console-api services/titan-console-api/


# Build shared package first
WORKDIR /app/packages/shared
RUN npm run build

# Build the service
WORKDIR /app/services/titan-console-api
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/*.json ./packages/shared/
COPY --from=builder /app/services/titan-console-api/dist ./dist
COPY --from=builder /app/services/titan-console-api/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Install curl for healthcheck
RUN apk add --no-cache curl

EXPOSE 3000

CMD ["node", "dist/src/index.js"]
