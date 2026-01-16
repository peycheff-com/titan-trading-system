#!/bin/bash
# Titan Trading System - VPS Setup Script
# Run as root on a fresh Ubuntu 24.04 VPS

set -e

echo "🚀 Setting up Titan Trading System VPS..."

# =============================================================================
# 1. SYSTEM UPDATES
# =============================================================================
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# =============================================================================
# 2. INSTALL DOCKER
# =============================================================================
echo "🐳 Installing Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# =============================================================================
# 3. INSTALL DOCKER COMPOSE
# =============================================================================
echo "📦 Installing Docker Compose..."
apt install -y docker-compose-plugin

# =============================================================================
# 4. CONFIGURE FIREWALL
# =============================================================================
echo "🔥 Configuring UFW firewall..."
apt install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

# =============================================================================
# 5. CREATE DEPLOY USER
# =============================================================================
echo "👤 Creating deploy user..."
useradd -m -s /bin/bash -G docker deploy || true

# =============================================================================
# 6. CLONE REPOSITORY
# =============================================================================
echo "📂 Setting up application directory..."
mkdir -p /opt/titan
cd /opt/titan

if [ ! -d ".git" ]; then
    git clone https://github.com/peycheff-com/titan-trading-system.git .
fi

chown -R deploy:deploy /opt/titan

# =============================================================================
# 7. SETUP ENVIRONMENT
# =============================================================================
echo "⚙️ Setting up environment..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "⚠️  Please edit /opt/titan/.env with your production values!"
fi

# =============================================================================
# 8. BUILD & START
# =============================================================================
echo "🏗️ Building and starting services..."
docker compose -f docker-compose.prod.yml build --parallel
docker compose -f docker-compose.prod.yml up -d

# =============================================================================
# COMPLETE
# =============================================================================
echo ""
echo "✅ Titan Trading System setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit /opt/titan/.env with your production values"
echo "2. Restart: docker compose -f docker-compose.prod.yml up -d"
echo "3. Check status: docker compose -f docker-compose.prod.yml ps"
echo ""
echo "GitHub Actions secrets needed:"
echo "  VPS_HOST     = $(curl -s ifconfig.me)"
echo "  VPS_USER     = deploy"
echo "  VPS_SSH_KEY  = (add deploy user's private key)"
