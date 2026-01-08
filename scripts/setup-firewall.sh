#!/bin/bash

# Firewall and Access Control Setup Script for Titan Production Deployment
# Requirements: 4.3, 4.4

set -euo pipefail

# Configuration
ALLOWED_IPS_FILE="${1:-/etc/titan/allowed-ips.txt}"
LOG_FILE="/var/log/titan/firewall-setup.log"
CONFIG_DIR="/etc/titan"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $message" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    local message="$1"
    echo -e "${RED}ERROR: $message${NC}" >&2
    log "ERROR: $message"
    exit 1
}

# Success message
success() {
    local message="$1"
    echo -e "${GREEN}SUCCESS: $message${NC}"
    log "SUCCESS: $message"
}

# Warning message
warning() {
    local message="$1"
    echo -e "${YELLOW}WARNING: $message${NC}"
    log "WARNING: $message"
}

# Info message
info() {
    local message="$1"
    echo -e "${BLUE}INFO: $message${NC}"
    log "INFO: $message"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error_exit "This script must be run as root"
    fi
}

# Create necessary directories
create_directories() {
    log "Creating necessary directories..."
    
    mkdir -p "$CONFIG_DIR"
    mkdir -p /var/log/titan
    mkdir -p /etc/fail2ban/jail.d
    mkdir -p /etc/fail2ban/filter.d
    
    # Set proper permissions
    chmod 755 /var/log/titan "$CONFIG_DIR"
    chown root:root /var/log/titan "$CONFIG_DIR"
}

# Install required packages
install_dependencies() {
    log "Installing required packages..."
    
    # Update package list
    apt-get update -qq
    
    # Install required packages
    apt-get install -y \
        ufw \
        fail2ban \
        iptables-persistent \
        netfilter-persistent \
        geoip-bin \
        geoip-database
    
    success "Dependencies installed successfully"
}

# Create default allowed IPs file if it doesn't exist
create_default_allowed_ips() {
    if [[ ! -f "$ALLOWED_IPS_FILE" ]]; then
        log "Creating default allowed IPs file..."
        
        cat > "$ALLOWED_IPS_FILE" << EOF
# Titan Trading System - Allowed IP Addresses
# Add one IP address or CIDR block per line
# Lines starting with # are comments

# Example entries:
# 192.168.1.100        # Office IP
# 10.0.0.0/8           # Private network
# 203.0.113.0/24       # Company subnet

# Emergency access (always allowed)
127.0.0.1             # Localhost
::1                   # IPv6 localhost

# Add your IP addresses below:
EOF
        
        # Try to detect current SSH connection IP
        if [[ -n "${SSH_CLIENT:-}" ]]; then
            local ssh_ip=$(echo "$SSH_CLIENT" | awk '{print $1}')
            echo "$ssh_ip             # Current SSH connection" >> "$ALLOWED_IPS_FILE"
            warning "Added current SSH IP ($ssh_ip) to allowed list"
        fi
        
        warning "Please edit $ALLOWED_IPS_FILE to add your authorized IP addresses"
        warning "Current file contents:"
        cat "$ALLOWED_IPS_FILE"
        
        read -p "Press Enter to continue after reviewing the IP list..."
    fi
}

# Read and validate allowed IPs
read_allowed_ips() {
    log "Reading allowed IP addresses from $ALLOWED_IPS_FILE"
    
    if [[ ! -f "$ALLOWED_IPS_FILE" ]]; then
        error_exit "Allowed IPs file not found: $ALLOWED_IPS_FILE"
    fi
    
    # Read IPs, skip comments and empty lines
    ALLOWED_IPS=()
    while IFS= read -r line; do
        # Skip comments and empty lines
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line// }" ]] && continue
        
        # Extract IP (remove comments)
        local ip=$(echo "$line" | awk '{print $1}')
        
        # Validate IP format
        if validate_ip "$ip"; then
            ALLOWED_IPS+=("$ip")
            log "Added allowed IP: $ip"
        else
            warning "Invalid IP format, skipping: $ip"
        fi
    done < "$ALLOWED_IPS_FILE"
    
    if [[ ${#ALLOWED_IPS[@]} -eq 0 ]]; then
        error_exit "No valid IP addresses found in $ALLOWED_IPS_FILE"
    fi
    
    success "Loaded ${#ALLOWED_IPS[@]} allowed IP addresses"
}

# Validate IP address or CIDR
validate_ip() {
    local ip="$1"
    
    # Check if it's a valid IPv4 address
    if [[ "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        return 0
    fi
    
    # Check if it's a valid CIDR notation
    if [[ "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/[0-9]{1,2}$ ]]; then
        return 0
    fi
    
    # Check if it's IPv6
    if [[ "$ip" =~ ^::1$ ]] || [[ "$ip" =~ ^[0-9a-fA-F:]+$ ]]; then
        return 0
    fi
    
    return 1
}

# Configure UFW firewall
configure_ufw() {
    log "Configuring UFW firewall..."
    
    # Reset UFW to start fresh
    ufw --force reset
    
    # Set default policies
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow loopback
    ufw allow in on lo
    ufw allow out on lo
    
    # Allow SSH from allowed IPs only
    for ip in "${ALLOWED_IPS[@]}"; do
        ufw allow from "$ip" to any port 22 comment "SSH access for $ip"
        log "Added SSH rule for: $ip"
    done
    
    # Allow HTTP/HTTPS from allowed IPs only
    for ip in "${ALLOWED_IPS[@]}"; do
        ufw allow from "$ip" to any port 80 comment "HTTP access for $ip"
        ufw allow from "$ip" to any port 443 comment "HTTPS access for $ip"
        log "Added HTTP/HTTPS rules for: $ip"
    done
    
    # Allow Redis (localhost only)
    ufw allow from 127.0.0.1 to any port 6379 comment "Redis localhost"
    
    # Allow internal communication for Titan services
    ufw allow from 127.0.0.1 to any port 3000 comment "Titan Console"

    
    # Enable UFW
    ufw --force enable
    
    success "UFW firewall configured and enabled"
}

# Configure Fail2Ban
configure_fail2ban() {
    log "Configuring Fail2Ban..."
    
    # Create Titan-specific jail configuration
    cat > /etc/fail2ban/jail.d/titan.conf << EOF
# Titan Fail2Ban Configuration
# Generated automatically

[DEFAULT]
# Ban hosts for 1 hour
bantime = 3600

# A host is banned if it has generated "maxretry" during the last "findtime" seconds
findtime = 600
maxretry = 3

# Email notifications
destemail = admin@titan-trading.com
sender = fail2ban@titan-trading.com

# Action to take when banning an IP
action = %(action_mwl)s

[titan-ssh]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
findtime = 600

[titan-nginx-http-auth]
enabled = true
port = http,https
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 5
bantime = 1800
findtime = 300

[titan-nginx-noscript]
enabled = true
port = http,https
filter = nginx-noscript
logpath = /var/log/nginx/access.log
maxretry = 6
bantime = 1800
findtime = 300

[titan-nginx-badbots]
enabled = true
port = http,https
filter = nginx-badbots
logpath = /var/log/nginx/access.log
maxretry = 2
bantime = 3600
findtime = 600

[titan-nginx-noproxy]
enabled = true
port = http,https
filter = nginx-noproxy
logpath = /var/log/nginx/access.log
maxretry = 2
bantime = 3600
findtime = 600
EOF

    # Create custom filter for Titan API
    cat > /etc/fail2ban/filter.d/titan-api.conf << EOF
# Titan API Fail2Ban Filter

[Definition]
failregex = ^<HOST> -.*"(GET|POST|PUT|DELETE) /api/.*" (401|403|429) .*$
            ^.*\[<HOST>\].*SECURITY_EVENT.*UNAUTHORIZED_ACCESS.*$
            ^.*\[<HOST>\].*SECURITY_EVENT.*BRUTE_FORCE_ATTEMPT.*$

ignoreregex = ^<HOST> -.*"(GET|POST|PUT|DELETE) /api/health.*" 200 .*$
EOF



    # Restart and enable Fail2Ban
    systemctl restart fail2ban
    systemctl enable fail2ban
    
    # Wait for Fail2Ban to start
    sleep 3
    
    # Verify Fail2Ban is running
    if systemctl is-active --quiet fail2ban; then
        success "Fail2Ban configured and running"
        
        # Show jail status
        info "Active Fail2Ban jails:"
        fail2ban-client status | grep "Jail list:" | sed 's/.*Jail list://'
    else
        error_exit "Fail2Ban failed to start"
    fi
}

# Create Nginx access control configuration
create_nginx_access_control() {
    log "Creating Nginx access control configuration..."
    
    local nginx_config="/etc/nginx/conf.d/titan-access-control.conf"
    
    cat > "$nginx_config" << EOF
# Titan Access Control Configuration
# Generated automatically

# Geo module for IP-based access control
geo \$allowed_ip {
    default 0;
EOF

    # Add allowed IPs to Nginx configuration
    for ip in "${ALLOWED_IPS[@]}"; do
        echo "    $ip 1;" >> "$nginx_config"
    done

    cat >> "$nginx_config" << EOF
}

# Rate limiting zones
limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone \$binary_remote_addr zone=general:10m rate=30r/s;
limit_req_zone \$binary_remote_addr zone=login:10m rate=5r/m;

# Connection limiting
limit_conn_zone \$binary_remote_addr zone=perip:10m;
limit_conn_zone \$server_name zone=perserver:10m;

# Map for access control
map \$allowed_ip \$access_granted {
    default 0;
    1 1;
}
EOF

    success "Nginx access control configuration created"
}

# Test firewall configuration
test_firewall() {
    log "Testing firewall configuration..."
    
    # Test UFW status
    local ufw_status=$(ufw status | head -1)
    if [[ "$ufw_status" == *"active"* ]]; then
        success "UFW is active"
    else
        error_exit "UFW is not active"
    fi
    
    # Test Fail2Ban status
    if systemctl is-active --quiet fail2ban; then
        success "Fail2Ban is running"
        
        # Show banned IPs (if any)
        local banned_count=$(fail2ban-client status | grep -c "Currently banned:" || echo "0")
        info "Currently banned IPs: $banned_count"
    else
        error_exit "Fail2Ban is not running"
    fi
    
    # Test SSH access (should be allowed from current IP)
    if [[ -n "${SSH_CLIENT:-}" ]]; then
        local current_ip=$(echo "$SSH_CLIENT" | awk '{print $1}')
        info "Current SSH connection from: $current_ip"
        
        # Check if current IP is in allowed list
        local ip_allowed=false
        for ip in "${ALLOWED_IPS[@]}"; do
            if [[ "$ip" == "$current_ip" ]] || [[ "$ip" == *"/"* && "$current_ip" =~ ^${ip%/*} ]]; then
                ip_allowed=true
                break
            fi
        done
        
        if [[ "$ip_allowed" == true ]]; then
            success "Current IP is in allowed list"
        else
            warning "Current IP ($current_ip) is NOT in allowed list - you may lose access!"
        fi
    fi
}

# Create monitoring script
create_monitoring_script() {
    log "Creating firewall monitoring script..."
    
    cat > /usr/local/bin/titan-firewall-monitor.sh << 'EOF'
#!/bin/bash

# Titan Firewall Monitoring Script
LOG_FILE="/var/log/titan/firewall-monitor.log"
SECURITY_LOG="/var/log/titan/security.log"

log_event() {
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
    local event_type="$1"
    local details="$2"
    
    local log_entry=$(cat << EOL
{
  "timestamp": "$timestamp",
  "type": "SECURITY_EVENT",
  "eventType": "$event_type",
  "component": "FirewallMonitor",
  "details": $details
}
EOL
)
    
    echo "$log_entry" >> "$SECURITY_LOG"
    echo "[$timestamp] $event_type: $details" >> "$LOG_FILE"
}

# Check UFW status
if ! ufw status | grep -q "Status: active"; then
    log_event "FIREWALL_INACTIVE" '{"service": "ufw", "status": "inactive"}'
fi

# Check Fail2Ban status
if ! systemctl is-active --quiet fail2ban; then
    log_event "FAIL2BAN_INACTIVE" '{"service": "fail2ban", "status": "inactive"}'
fi

# Check for new banned IPs
BANNED_IPS=$(fail2ban-client status | grep "Currently banned:" | awk '{print $3}' || echo "0")
if [[ "$BANNED_IPS" -gt 0 ]]; then
    log_event "IPS_BANNED" "{\"count\": $BANNED_IPS}"
fi

# Check for suspicious activity in auth logs
FAILED_LOGINS=$(grep "Failed password" /var/log/auth.log | grep "$(date '+%b %d')" | wc -l)
if [[ "$FAILED_LOGINS" -gt 10 ]]; then
    log_event "SUSPICIOUS_LOGIN_ACTIVITY" "{\"failed_attempts\": $FAILED_LOGINS, \"date\": \"$(date '+%Y-%m-%d')\"}"
fi
EOF

    chmod +x /usr/local/bin/titan-firewall-monitor.sh
    
    # Add to crontab (run every 5 minutes)
    local cron_entry="*/5 * * * * /usr/local/bin/titan-firewall-monitor.sh"
    
    if ! crontab -l 2>/dev/null | grep -q "titan-firewall-monitor"; then
        (crontab -l 2>/dev/null; echo "$cron_entry") | crontab -
        success "Firewall monitoring cron job added"
    else
        info "Firewall monitoring cron job already exists"
    fi
}

# Log security event
log_security_event() {
    local event_type="$1"
    local details="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
    
    local log_entry=$(cat << EOF
{
  "timestamp": "$timestamp",
  "type": "SECURITY_EVENT",
  "eventType": "$event_type",
  "component": "FirewallSetup",
  "details": $details
}
EOF
)
    
    echo "$log_entry" >> /var/log/titan/security.log
}

# Main execution
main() {
    log "Starting firewall and access control setup..."
    
    check_root
    create_directories
    install_dependencies
    create_default_allowed_ips
    read_allowed_ips
    configure_ufw
    configure_fail2ban
    create_nginx_access_control
    create_monitoring_script
    test_firewall
    
    # Log security event
    log_security_event "FIREWALL_CONFIGURED" "{\"allowed_ips\": ${#ALLOWED_IPS[@]}, \"fail2ban_enabled\": true}"
    
    success "Firewall and access control setup completed successfully"
    
    echo ""
    echo "=== Firewall Setup Summary ==="
    echo "Allowed IPs: ${#ALLOWED_IPS[@]}"
    echo "UFW Status: $(ufw status | head -1)"
    echo "Fail2Ban Status: $(systemctl is-active fail2ban)"
    echo "Configuration: $ALLOWED_IPS_FILE"
    echo "Logs: /var/log/titan/"
    echo ""
    echo "IMPORTANT SECURITY NOTES:"
    echo "1. Only the IPs in $ALLOWED_IPS_FILE can access this server"
    echo "2. SSH, HTTP, and HTTPS are restricted to whitelisted IPs"
    echo "3. Fail2Ban is monitoring for brute force attacks"
    echo "4. All security events are logged to /var/log/titan/security.log"
    echo ""
    echo "To add/remove IPs:"
    echo "1. Edit $ALLOWED_IPS_FILE"
    echo "2. Run: $0"
    echo ""
    echo "To check firewall status:"
    echo "- UFW: ufw status"
    echo "- Fail2Ban: fail2ban-client status"
}

# Execute main function
main "$@"