#!/bin/bash
set -euo pipefail
# =============================================================================
# 01_bootstrap_host.sh - Harden and prepare a fresh Ubuntu 24.04 Droplet
# =============================================================================
# This script is idempotent and can be run multiple times safely.
# Run as root on a fresh Droplet.
# Usage: ssh root@<IP> 'bash -s' < scripts/ops/do/01_bootstrap_host.sh
# =============================================================================

set -euo pipefail

# Configuration
DEPLOY_USER="deploy"
DEPLOY_HOME="/home/${DEPLOY_USER}"
TITAN_ROOT="/opt/titan"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# 1. System Updates
# =============================================================================
log_info "Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# =============================================================================
# 2. Install Essential Packages
# =============================================================================
log_info "Installing essential packages..."
apt-get install -y -qq \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    fail2ban \
    ufw \
    unattended-upgrades \
    jq \
    htop \
    ncdu \
    git

# =============================================================================
# 3. Create Deploy User
# =============================================================================
if id "${DEPLOY_USER}" &>/dev/null; then
    log_info "User ${DEPLOY_USER} already exists"
else
    log_info "Creating user ${DEPLOY_USER}..."
    useradd -m -s /bin/bash "${DEPLOY_USER}"
    usermod -aG sudo "${DEPLOY_USER}"
    
    # Allow passwordless sudo for deploy user (for automated deploys)
    echo "${DEPLOY_USER} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/${DEPLOY_USER}
    chmod 440 /etc/sudoers.d/${DEPLOY_USER}
fi

# Copy SSH keys from root to deploy user
if [ -f /root/.ssh/authorized_keys ]; then
    log_info "Copying SSH keys to ${DEPLOY_USER}..."
    mkdir -p "${DEPLOY_HOME}/.ssh"
    cp /root/.ssh/authorized_keys "${DEPLOY_HOME}/.ssh/"
    chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_HOME}/.ssh"
    chmod 700 "${DEPLOY_HOME}/.ssh"
    chmod 600 "${DEPLOY_HOME}/.ssh/authorized_keys"
fi

# =============================================================================
# 4. SSH Hardening
# =============================================================================
log_info "Hardening SSH configuration..."

SSHD_CONFIG="/etc/ssh/sshd_config"
cp "${SSHD_CONFIG}" "${SSHD_CONFIG}.backup.$(date +%Y%m%d)"

# Function to set or update SSH config
set_ssh_config() {
    local key="$1"
    local value="$2"
    if grep -q "^${key}" "${SSHD_CONFIG}"; then
        sed -i "s/^${key}.*/${key} ${value}/" "${SSHD_CONFIG}"
    elif grep -q "^#${key}" "${SSHD_CONFIG}"; then
        sed -i "s/^#${key}.*/${key} ${value}/" "${SSHD_CONFIG}"
    else
        echo "${key} ${value}" >> "${SSHD_CONFIG}"
    fi
}

set_ssh_config "PasswordAuthentication" "no"
set_ssh_config "PermitRootLogin" "prohibit-password"
set_ssh_config "PubkeyAuthentication" "yes"
set_ssh_config "ChallengeResponseAuthentication" "no"
set_ssh_config "UsePAM" "yes"
set_ssh_config "X11Forwarding" "no"
set_ssh_config "AllowUsers" "${DEPLOY_USER} root"

# Validate and restart SSH
if sshd -t; then
    systemctl restart sshd
    log_info "SSH configuration updated and service restarted"
else
    log_error "SSH configuration invalid, reverting..."
    cp "${SSHD_CONFIG}.backup.$(date +%Y%m%d)" "${SSHD_CONFIG}"
    exit 1
fi

# =============================================================================
# 5. Configure UFW Firewall
# =============================================================================
log_info "Configuring UFW firewall..."

# Reset to default (deny incoming, allow outgoing)
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Allow essential ports
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP (ACME)'
ufw allow 443/tcp comment 'HTTPS'

# Enable UFW
ufw --force enable
log_info "UFW enabled. Status:"
ufw status verbose

# =============================================================================
# 6. Configure Fail2ban
# =============================================================================
log_info "Configuring fail2ban..."

cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 86400
EOF

systemctl enable fail2ban
systemctl restart fail2ban
log_info "Fail2ban configured and started"

# =============================================================================
# 7. Configure Unattended Upgrades
# =============================================================================
log_info "Configuring unattended upgrades for security patches..."

cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF

cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

systemctl enable unattended-upgrades
log_info "Unattended upgrades configured"

# =============================================================================
# 8. Install Docker
# =============================================================================
if command -v docker &>/dev/null; then
    log_info "Docker already installed: $(docker --version)"
else
    log_info "Installing Docker..."
    
    # Add Docker's official GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    
    # Add the repository to Apt sources
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Add deploy user to docker group
    usermod -aG docker "${DEPLOY_USER}"
    
    log_info "Docker installed: $(docker --version)"
fi

# Verify Docker Compose
log_info "Docker Compose version: $(docker compose version)"

# =============================================================================
# 9. Create Titan Directory Structure
# =============================================================================
log_info "Creating Titan directory structure..."

mkdir -p "${TITAN_ROOT}"/{releases,current,scripts,logs,state,compose}
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${TITAN_ROOT}"
chmod 755 "${TITAN_ROOT}"

# Create placeholder .env.prod if not exists
if [ ! -f "${TITAN_ROOT}/compose/.env.prod" ]; then
    log_warn "Creating placeholder .env.prod - MUST BE POPULATED WITH SECRETS"
    cat > "${TITAN_ROOT}/compose/.env.prod" << 'EOF'
# Titan Production Environment
# THIS FILE MUST BE POPULATED WITH PRODUCTION SECRETS

# ============================================================
# CRITICAL: Replace all values below before deployment
# ============================================================

# Domain
DOMAIN=titan.peycheff.com
ACME_EMAIL=admin@peycheff.com

# Database
DB_HOST=titan-postgres
DB_PORT=5432
DB_NAME=titan
DB_USER=titan_user
DB_PASSWORD=__CHANGE_ME__
DATABASE_URL=postgresql://titan_user:__CHANGE_ME__@titan-postgres:5432/titan

# NATS
NATS_URL=nats://titan-nats:4222
NATS_SYS_PASSWORD=__CHANGE_ME__
NATS_BRAIN_PASSWORD=__CHANGE_ME__
NATS_EXECUTION_PASSWORD=__CHANGE_ME__
NATS_SCAVENGER_PASSWORD=__CHANGE_ME__
NATS_HUNTER_PASSWORD=__CHANGE_ME__
NATS_SENTINEL_PASSWORD=__CHANGE_ME__
NATS_POWERLAW_PASSWORD=__CHANGE_ME__
NATS_QUANT_PASSWORD=__CHANGE_ME__
NATS_CONSOLE_PASSWORD=__CHANGE_ME__

# Redis
REDIS_URL=redis://titan-redis:6379

# Security
TITAN_MASTER_PASSWORD=__CHANGE_ME__
HMAC_SECRET=__CHANGE_ME__
JWT_SECRET=__CHANGE_ME__

# Exchange (Binance)
BINANCE_API_KEY=__CHANGE_ME__
BINANCE_SECRET_KEY=__CHANGE_ME__

# Safety
TITAN_MODE=DISARMED
EOF
    chmod 600 "${TITAN_ROOT}/compose/.env.prod"
    chown root:root "${TITAN_ROOT}/compose/.env.prod"
fi

# Create acme.json with correct permissions for Traefik
ACME_JSON="${TITAN_ROOT}/compose/acme.json"
if [ ! -f "${ACME_JSON}" ]; then
    log_info "Creating acme.json for TLS certificates..."
    touch "${ACME_JSON}"
    chmod 600 "${ACME_JSON}"
fi

# =============================================================================
# 10. System Tuning
# =============================================================================
log_info "Applying system tuning..."

# Increase file descriptor limits for Docker
cat > /etc/security/limits.d/docker.conf << 'EOF'
* soft nofile 65536
* hard nofile 65536
root soft nofile 65536
root hard nofile 65536
EOF

# Optimize sysctl for Docker
cat > /etc/sysctl.d/99-docker.conf << 'EOF'
# Increase inotify limits for Docker
fs.inotify.max_user_watches = 524288
fs.inotify.max_user_instances = 8192

# Network tuning
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
EOF
sysctl --system > /dev/null

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================================================"
log_info "Bootstrap complete! Summary:"
echo "============================================================"
echo ""
echo "  ✓ System packages updated"
echo "  ✓ User '${DEPLOY_USER}' created with sudo access"
echo "  ✓ SSH hardened (password auth disabled)"
echo "  ✓ UFW firewall enabled (22/80/443 only)"
echo "  ✓ Fail2ban configured"
echo "  ✓ Unattended security upgrades enabled"
echo "  ✓ Docker $(docker --version | cut -d' ' -f3) installed"
echo "  ✓ Titan directories created at ${TITAN_ROOT}"
echo ""
log_warn "IMPORTANT: Populate ${TITAN_ROOT}/compose/.env.prod with production secrets!"
echo ""
echo "Next steps:"
echo "  1. Test SSH as deploy user: ssh ${DEPLOY_USER}@<IP>"
echo "  2. Populate .env.prod with production secrets"
echo "  3. Run 02_prepare_runtime.sh"
echo ""
