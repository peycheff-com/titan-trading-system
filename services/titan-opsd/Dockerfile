# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json package-lock.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY services/titan-opsd/package.json services/titan-opsd/

# Install dependencies
RUN npm ci --workspace=packages/shared --workspace=services/titan-opsd

# Copy source code
COPY packages/shared packages/shared/
COPY services/titan-opsd services/titan-opsd/

# Build shared package first
WORKDIR /app/packages/shared
RUN npm run build

# Build the service
WORKDIR /app/services/titan-opsd
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/*.json ./packages/shared/
COPY --from=builder /app/services/titan-opsd/dist ./dist
COPY --from=builder /app/services/titan-opsd/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Install docker CLI for container operations
RUN apk add --no-cache docker-cli

CMD ["node", "dist/src/index.js"]
