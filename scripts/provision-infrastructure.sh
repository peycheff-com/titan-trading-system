#!/bin/bash

# Titan Production Infrastructure Provisioning Script
# This script provisions a VPS instance with all required dependencies for the Titan Trading System
# Requirements: 1.1, 1.2, 1.3, 1.4, 1.5

set -euo pipefail

# Configuration
MIN_RAM_GB=8
MIN_CPU_CORES=4
NODE_VERSION="18"
REDIS_PORT=6379
DOMAIN=""
EMAIL=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        error "This script should not be run as root. Please run as a regular user with sudo privileges."
        exit 1
    fi
}

# Validate system requirements
validate_system_requirements() {
    log "Validating system requirements..."
    
    # Check RAM
    local ram_gb=$(free -g | awk '/^Mem:/{print $2}')
    if [[ $ram_gb -lt $MIN_RAM_GB ]]; then
        error "Insufficient RAM: ${ram_gb}GB available, ${MIN_RAM_GB}GB required"
        exit 1
    fi
    success "RAM check passed: ${ram_gb}GB available"
    
    # Check CPU cores
    local cpu_cores=$(nproc)
    if [[ $cpu_cores -lt $MIN_CPU_CORES ]]; then
        error "Insufficient CPU cores: ${cpu_cores} available, ${MIN_CPU_CORES} required"
        exit 1
    fi
    success "CPU check passed: ${cpu_cores} cores available"
    
    # Check OS
    if ! grep -q "Ubuntu" /etc/os-release; then
        warning "This script is optimized for Ubuntu. Proceeding anyway..."
    fi
}

# Update system packages
update_system() {
    log "Updating system packages..."
    sudo apt-get update -y
    sudo apt-get upgrade -y
    success "System packages updated"
}

# Install Node.js v18+
install_nodejs() {
    log "Installing Node.js v${NODE_VERSION}..."
    
    # Install NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    # Verify installation
    local node_version=$(node --version)
    local npm_version=$(npm --version)
    
    success "Node.js installed: ${node_version}"
    success "npm installed: ${npm_version}"
}

# Install Redis
install_redis() {
    log "Installing Redis..."
    
    sudo apt-get install -y redis-server
    
    # Configure Redis for production
    sudo sed -i "s/^# maxmemory <bytes>/maxmemory 2gb/" /etc/redis/redis.conf
    sudo sed -i "s/^# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/" /etc/redis/redis.conf
    sudo sed -i "s/^bind 127.0.0.1 ::1/bind 127.0.0.1/" /etc/redis/redis.conf
    
    # Enable and start Redis
    sudo systemctl enable redis-server
    sudo systemctl start redis-server
    
    # Verify installation
    if redis-cli ping | grep -q "PONG"; then
        success "Redis installed and running"
    else
        error "Redis installation failed"
        exit 1
    fi
}

# Install PM2
install_pm2() {
    log "Installing PM2..."
    
    sudo npm install -g pm2
    
    # Configure PM2 startup
    pm2 startup | grep -E "^sudo" | bash || true
    
    success "PM2 installed and configured for startup"
}

# Install Nginx
install_nginx() {
    log "Installing Nginx..."
    
    sudo apt-get install -y nginx
    
    # Enable and start Nginx
    sudo systemctl enable nginx
    sudo systemctl start nginx
    
    success "Nginx installed and running"
}

# Configure firewall
configure_firewall() {
    log "Configuring UFW firewall..."
    
    # Reset firewall to defaults
    sudo ufw --force reset
    
    # Set default policies
    sudo ufw default deny incoming
    sudo ufw default allow outgoing
    
    # Allow SSH (port 22)
    sudo ufw allow 22/tcp comment 'SSH'
    
    # Allow HTTP (port 80)
    sudo ufw allow 80/tcp comment 'HTTP'
    
    # Allow HTTPS (port 443)
    sudo ufw allow 443/tcp comment 'HTTPS'
    
    # Allow Redis port (only from localhost)
    sudo ufw allow from 127.0.0.1 to any port $REDIS_PORT comment 'Redis localhost'
    
    # Enable firewall
    sudo ufw --force enable
    
    success "Firewall configured and enabled"
    sudo ufw status verbose
}

# Install fail2ban for additional security
install_fail2ban() {
    log "Installing fail2ban for brute force protection..."
    
    sudo apt-get install -y fail2ban
    
    # Create custom jail configuration
    sudo tee /etc/fail2ban/jail.local > /dev/null <<EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
port = http,https
logpath = /var/log/nginx/error.log
EOF
    
    # Enable and start fail2ban
    sudo systemctl enable fail2ban
    sudo systemctl start fail2ban
    
    success "fail2ban installed and configured"
}

# Configure automatic security updates
configure_auto_updates() {
    log "Configuring automatic security updates..."
    
    sudo apt-get install -y unattended-upgrades apt-listchanges
    
    # Configure unattended upgrades
    sudo tee /etc/apt/apt.conf.d/50unattended-upgrades > /dev/null <<EOF
Unattended-Upgrade::Allowed-Origins {
    "\${distro_id}:\${distro_codename}-security";
    "\${distro_id}ESMApps:\${distro_codename}-apps-security";
    "\${distro_id}ESM:\${distro_codename}-infra-security";
};

Unattended-Upgrade::Package-Blacklist {
};

Unattended-Upgrade::DevRelease "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Automatic-Reboot-Time "02:00";
EOF
    
    # Enable automatic updates
    sudo tee /etc/apt/apt.conf.d/20auto-upgrades > /dev/null <<EOF
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF
    
    success "Automatic security updates configured"
}

# Setup SSL certificates with Let's Encrypt
setup_ssl() {
    if [[ -z "$DOMAIN" ]]; then
        warning "Domain not provided, skipping SSL certificate setup"
        warning "Run 'sudo certbot --nginx -d yourdomain.com' manually after setting up domain"
        return 0
    fi
    
    log "Setting up SSL certificates for domain: $DOMAIN"
    
    # Install certbot
    sudo apt-get install -y certbot python3-certbot-nginx
    
    # Obtain SSL certificate
    if [[ -n "$EMAIL" ]]; then
        sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL"
    else
        warning "Email not provided for SSL certificate"
        warning "Run 'sudo certbot --nginx -d $DOMAIN' manually"
        return 0
    fi
    
    # Setup automatic renewal
    sudo systemctl enable certbot.timer
    sudo systemctl start certbot.timer
    
    success "SSL certificates configured for $DOMAIN"
}

# Create titan user and directories
setup_titan_user() {
    log "Setting up titan user and directories..."
    
    # Create titan user if it doesn't exist
    if ! id "titan" &>/dev/null; then
        sudo useradd -m -s /bin/bash titan
        sudo usermod -aG sudo titan
        success "Created titan user"
    else
        log "titan user already exists"
    fi
    
    # Create application directories
    sudo mkdir -p /opt/titan/{services,config,logs,backups}
    sudo chown -R titan:titan /opt/titan
    sudo chmod -R 755 /opt/titan
    
    success "Titan directories created"
}

# Configure system limits for high-frequency trading
configure_system_limits() {
    log "Configuring system limits for high-frequency trading..."
    
    # Increase file descriptor limits
    sudo tee -a /etc/security/limits.conf > /dev/null <<EOF
# Titan Trading System limits
titan soft nofile 65536
titan hard nofile 65536
titan soft nproc 32768
titan hard nproc 32768
EOF
    
    # Configure kernel parameters
    sudo tee -a /etc/sysctl.conf > /dev/null <<EOF
# Titan Trading System kernel parameters
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.core.netdev_max_backlog = 5000
vm.swappiness = 10
EOF
    
    # Apply kernel parameters
    sudo sysctl -p
    
    success "System limits configured for high-frequency trading"
}

# Verify installation
verify_installation() {
    log "Verifying installation..."
    
    local errors=0
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        error "Node.js not found"
        ((errors++))
    else
        success "Node.js: $(node --version)"
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        error "npm not found"
        ((errors++))
    else
        success "npm: $(npm --version)"
    fi
    
    # Check Redis
    if ! systemctl is-active --quiet redis-server; then
        error "Redis is not running"
        ((errors++))
    else
        success "Redis is running"
    fi
    
    # Check PM2
    if ! command -v pm2 &> /dev/null; then
        error "PM2 not found"
        ((errors++))
    else
        success "PM2: $(pm2 --version)"
    fi
    
    # Check Nginx
    if ! systemctl is-active --quiet nginx; then
        error "Nginx is not running"
        ((errors++))
    else
        success "Nginx is running"
    fi
    
    # Check firewall
    if ! sudo ufw status | grep -q "Status: active"; then
        error "UFW firewall is not active"
        ((errors++))
    else
        success "UFW firewall is active"
    fi
    
    # Check fail2ban
    if ! systemctl is-active --quiet fail2ban; then
        error "fail2ban is not running"
        ((errors++))
    else
        success "fail2ban is running"
    fi
    
    if [[ $errors -eq 0 ]]; then
        success "All components verified successfully!"
        return 0
    else
        error "$errors component(s) failed verification"
        return 1
    fi
}

# Display usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
    -d, --domain DOMAIN     Domain name for SSL certificate setup
    -e, --email EMAIL       Email address for SSL certificate registration
    -h, --help             Show this help message

Examples:
    $0                                          # Basic installation
    $0 -d titan.example.com -e admin@example.com  # With SSL setup

This script will:
1. Validate system requirements (8GB RAM, 4 CPU cores)
2. Install Node.js v18+, Redis, PM2, and Nginx
3. Configure UFW firewall with secure defaults
4. Install fail2ban for brute force protection
5. Configure automatic security updates
6. Setup SSL certificates (if domain provided)
7. Create titan user and application directories
8. Configure system limits for high-frequency trading

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -d|--domain)
                DOMAIN="$2"
                shift 2
                ;;
            -e|--email)
                EMAIL="$2"
                shift 2
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
}

# Main execution
main() {
    log "Starting Titan Production Infrastructure Provisioning..."
    
    parse_args "$@"
    check_root
    validate_system_requirements
    
    update_system
    install_nodejs
    install_redis
    install_pm2
    install_nginx
    configure_firewall
    install_fail2ban
    configure_auto_updates
    setup_ssl
    setup_titan_user
    configure_system_limits
    
    if verify_installation; then
        success "Infrastructure provisioning completed successfully!"
        log "Next steps:"
        log "1. Configure your domain DNS to point to this server"
        log "2. Run SSL setup if not done: sudo certbot --nginx -d yourdomain.com"
        log "3. Deploy Titan services using the deployment pipeline"
        log "4. Configure monitoring and alerting"
    else
        error "Infrastructure provisioning completed with errors"
        exit 1
    fi
}

# Run main function with all arguments
main "$@"