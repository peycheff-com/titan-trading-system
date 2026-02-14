# Build stage
FROM node:25-alpine AS builder

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./
COPY apps/titan-console/package.json apps/titan-console/
COPY packages/shared/package.json packages/shared/

# Install dependencies (full monorepo for workspace linking)
RUN npm ci

# Copy shared package and build it first
COPY packages/shared packages/shared/
WORKDIR /app/packages/shared
RUN npm run build

# Copy console source and build
WORKDIR /app
COPY apps/titan-console apps/titan-console/

WORKDIR /app/apps/titan-console
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Production stage - serve with nginx
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/apps/titan-console/dist /usr/share/nginx/html

# Custom nginx config for SPA routing with permissive CSP for production
RUN cat <<'EOF' > /etc/nginx/conf.d/default.conf
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    
    location / {
        add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https: wss: http:; manifest-src 'self'; frame-ancestors 'self';" always;
        try_files $uri $uri/ /index.html;
    }
    
    location /health {
        access_log off;
        return 200 "ok";
        add_header Content-Type text/plain;
    }
}
EOF

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
