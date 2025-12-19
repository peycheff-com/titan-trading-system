#!/bin/bash

# Titan Infrastructure Validation Script
# Validates that the infrastructure meets all requirements for production deployment
# Requirements: 1.1, 1.2, 1.3, 1.4, 1.5

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Logging functions
log() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED++))
}

fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED++))
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
}

# Validate system specifications (Requirement 1.1)
validate_system_specs() {
    log "Validating system specifications..."
    
    # Check RAM (minimum 8GB)
    local ram_gb=$(free -g | awk '/^Mem:/{print $2}')
    if [[ $ram_gb -ge 8 ]]; then
        pass "RAM: ${ram_gb}GB (≥8GB required)"
    else
        fail "RAM: ${ram_gb}GB (8GB required)"
    fi
    
    # Check CPU cores (minimum 4)
    local cpu_cores=$(nproc)
    if [[ $cpu_cores -ge 4 ]]; then
        pass "CPU cores: ${cpu_cores} (≥4 required)"
    else
        fail "CPU cores: ${cpu_cores} (4 required)"
    fi
    
    # Check disk space (minimum 50GB free)
    local disk_gb=$(df / | awk 'NR==2 {print int($4/1024/1024)}')
    if [[ $disk_gb -ge 50 ]]; then
        pass "Disk space: ${disk_gb}GB free (≥50GB recommended)"
    else
        warn "Disk space: ${disk_gb}GB free (50GB recommended)"
    fi
}

# Validate Node.js installation (Requirement 1.2)
validate_nodejs() {
    log "Validating Node.js installation..."
    
    if command -v node &> /dev/null; then
        local node_version=$(node --version | sed 's/v//')
        local major_version=$(echo $node_version | cut -d. -f1)
        
        if [[ $major_version -ge 18 ]]; then
            pass "Node.js: v${node_version} (≥v18 required)"
        else
            fail "Node.js: v${node_version} (v18+ required)"
        fi
    else
        fail "Node.js: Not installed"
    fi
    
    if command -v npm &> /dev/null; then
        local npm_version=$(npm --version)
        pass "npm: v${npm_version}"
    else
        fail "npm: Not installed"
    fi
}

# Validate Redis installation (Requirement 1.2)
validate_redis() {
    log "Validating Redis installation..."
    
    if command -v redis-server &> /dev/null; then
        local redis_version=$(redis-server --version | awk '{print $3}' | sed 's/v=//')
        pass "Redis server: v${redis_version}"
    else
        fail "Redis server: Not installed"
    fi
    
    if systemctl is-active --quiet redis-server; then
        pass "Redis service: Running"
    else
        fail "Redis service: Not running"
    fi
    
    if redis-cli ping 2>/dev/null | grep -q "PONG"; then
        pass "Redis connectivity: OK"
    else
        fail "Redis connectivity: Failed"
    fi
}

# Validate PM2 installation (Requirement 1.2)
validate_pm2() {
    log "Validating PM2 installation..."
    
    if command -v pm2 &> /dev/null; then
        local pm2_version=$(pm2 --version)
        pass "PM2: v${pm2_version}"
    else
        fail "PM2: Not installed"
    fi
    
    # Check if PM2 startup is configured
    if pm2 startup 2>/dev/null | grep -q "already setup"; then
        pass "PM2 startup: Configured"
    else
        warn "PM2 startup: Not configured (run 'pm2 startup')"
    fi
}

# Validate Nginx installation (Requirement 1.2)
validate_nginx() {
    log "Validating Nginx installation..."
    
    if command -v nginx &> /dev/null; then
        local nginx_version=$(nginx -v 2>&1 | awk '{print $3}' | sed 's/nginx\///')
        pass "Nginx: v${nginx_version}"
    else
        fail "Nginx: Not installed"
    fi
    
    if systemctl is-active --quiet nginx; then
        pass "Nginx service: Running"
    else
        fail "Nginx service: Not running"
    fi
    
    # Test Nginx configuration
    if nginx -t &>/dev/null; then
        pass "Nginx configuration: Valid"
    else
        fail "Nginx configuration: Invalid"
    fi
}

# Validate firewall configuration (Requirement 1.3)
validate_firewall() {
    log "Validating firewall configuration..."
    
    if command -v ufw &> /dev/null; then
        pass "UFW: Installed"
    else
        fail "UFW: Not installed"
    fi
    
    if sudo ufw status | grep -q "Status: active"; then
        pass "UFW: Active"
    else
        fail "UFW: Inactive"
    fi
    
    # Check required ports
    local ufw_status=$(sudo ufw status numbered)
    
    if echo "$ufw_status" | grep -q "22/tcp"; then
        pass "SSH port (22): Allowed"
    else
        fail "SSH port (22): Not configured"
    fi
    
    if echo "$ufw_status" | grep -q "80/tcp"; then
        pass "HTTP port (80): Allowed"
    else
        fail "HTTP port (80): Not configured"
    fi
    
    if echo "$ufw_status" | grep -q "443/tcp"; then
        pass "HTTPS port (443): Allowed"
    else
        fail "HTTPS port (443): Not configured"
    fi
    
    # Check Redis port (should be restricted to localhost)
    if echo "$ufw_status" | grep -q "6379"; then
        if echo "$ufw_status" | grep "6379" | grep -q "127.0.0.1"; then
            pass "Redis port (6379): Restricted to localhost"
        else
            warn "Redis port (6379): Not restricted to localhost"
        fi
    else
        warn "Redis port (6379): No explicit rule (default deny should protect)"
    fi
}

# Validate SSL configuration (Requirement 1.4)
validate_ssl() {
    log "Validating SSL configuration..."
    
    if command -v certbot &> /dev/null; then
        pass "Certbot: Installed"
    else
        warn "Certbot: Not installed (manual SSL setup required)"
    fi
    
    # Check for SSL certificates
    if [[ -d /etc/letsencrypt/live ]]; then
        local cert_count=$(find /etc/letsencrypt/live -maxdepth 1 -type d | wc -l)
        if [[ $cert_count -gt 1 ]]; then
            pass "SSL certificates: Found $((cert_count-1)) certificate(s)"
        else
            warn "SSL certificates: None found (run certbot after domain setup)"
        fi
    else
        warn "SSL certificates: Directory not found"
    fi
    
    # Check certbot timer
    if systemctl is-enabled --quiet certbot.timer 2>/dev/null; then
        pass "SSL auto-renewal: Enabled"
    else
        warn "SSL auto-renewal: Not configured"
    fi
}

# Validate security hardening (Requirement 1.5)
validate_security() {
    log "Validating security configuration..."
    
    # Check fail2ban
    if command -v fail2ban-server &> /dev/null; then
        pass "fail2ban: Installed"
    else
        warn "fail2ban: Not installed"
    fi
    
    if systemctl is-active --quiet fail2ban 2>/dev/null; then
        pass "fail2ban service: Running"
    else
        warn "fail2ban service: Not running"
    fi
    
    # Check automatic updates
    if [[ -f /etc/apt/apt.conf.d/20auto-upgrades ]]; then
        if grep -q "1" /etc/apt/apt.conf.d/20auto-upgrades; then
            pass "Automatic security updates: Enabled"
        else
            warn "Automatic security updates: Disabled"
        fi
    else
        warn "Automatic security updates: Not configured"
    fi
    
    # Check unattended upgrades
    if [[ -f /etc/apt/apt.conf.d/50unattended-upgrades ]]; then
        pass "Unattended upgrades: Configured"
    else
        warn "Unattended upgrades: Not configured"
    fi
}

# Validate system limits for trading
validate_system_limits() {
    log "Validating system limits for high-frequency trading..."
    
    # Check file descriptor limits
    local soft_nofile=$(ulimit -Sn)
    local hard_nofile=$(ulimit -Hn)
    
    if [[ $soft_nofile -ge 65536 ]]; then
        pass "File descriptors (soft): $soft_nofile (≥65536)"
    else
        warn "File descriptors (soft): $soft_nofile (65536 recommended)"
    fi
    
    if [[ $hard_nofile -ge 65536 ]]; then
        pass "File descriptors (hard): $hard_nofile (≥65536)"
    else
        warn "File descriptors (hard): $hard_nofile (65536 recommended)"
    fi
    
    # Check process limits
    local soft_nproc=$(ulimit -Su)
    if [[ $soft_nproc -ge 32768 ]]; then
        pass "Process limit (soft): $soft_nproc (≥32768)"
    else
        warn "Process limit (soft): $soft_nproc (32768 recommended)"
    fi
    
    # Check network parameters
    local rmem_max=$(sysctl -n net.core.rmem_max 2>/dev/null || echo "0")
    if [[ $rmem_max -ge 16777216 ]]; then
        pass "Network buffer (rmem_max): $rmem_max (≥16777216)"
    else
        warn "Network buffer (rmem_max): $rmem_max (16777216 recommended)"
    fi
}

# Validate titan user and directories
validate_titan_setup() {
    log "Validating Titan user and directories..."
    
    if id "titan" &>/dev/null; then
        pass "Titan user: Exists"
    else
        warn "Titan user: Not created"
    fi
    
    if [[ -d /opt/titan ]]; then
        pass "Titan directory: /opt/titan exists"
        
        local required_dirs=("services" "config" "logs" "backups")
        for dir in "${required_dirs[@]}"; do
            if [[ -d "/opt/titan/$dir" ]]; then
                pass "Titan subdirectory: /opt/titan/$dir exists"
            else
                warn "Titan subdirectory: /opt/titan/$dir missing"
            fi
        done
    else
        warn "Titan directory: /opt/titan not found"
    fi
}

# Generate summary report
generate_summary() {
    echo
    log "=== INFRASTRUCTURE VALIDATION SUMMARY ==="
    echo
    
    if [[ $FAILED -eq 0 ]]; then
        pass "Infrastructure validation: PASSED"
        log "✅ All critical requirements met"
    else
        fail "Infrastructure validation: FAILED"
        log "❌ $FAILED critical requirement(s) not met"
    fi
    
    if [[ $WARNINGS -gt 0 ]]; then
        warn "$WARNINGS warning(s) found - review recommended"
    fi
    
    echo
    log "Results: $PASSED passed, $FAILED failed, $WARNINGS warnings"
    echo
    
    if [[ $FAILED -eq 0 ]]; then
        log "✅ Infrastructure is ready for Titan deployment"
        log "Next steps:"
        log "1. Deploy Titan services using deployment pipeline"
        log "2. Configure SSL certificates if not done"
        log "3. Set up monitoring and alerting"
        log "4. Run security audit"
        return 0
    else
        log "❌ Infrastructure requires fixes before deployment"
        log "Please address the failed requirements and run validation again"
        return 1
    fi
}

# Main execution
main() {
    log "Starting Titan Infrastructure Validation..."
    echo
    
    validate_system_specs
    validate_nodejs
    validate_redis
    validate_pm2
    validate_nginx
    validate_firewall
    validate_ssl
    validate_security
    validate_system_limits
    validate_titan_setup
    
    generate_summary
}

# Check if running with proper permissions
if [[ $EUID -eq 0 ]]; then
    log "Running as root - some checks may not reflect user limits"
fi

# Run main function
main "$@"