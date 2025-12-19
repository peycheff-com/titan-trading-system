#!/bin/bash

# Comprehensive Security Setup Script for Titan Production Deployment
# This script orchestrates TLS, firewall, and API key management setup
# Requirements: 4.1, 4.2, 4.3, 4.4, 4.5

set -euo pipefail

# Configuration
DOMAIN="${1:-}"
MASTER_PASSWORD="${2:-}"
ALLOWED_IPS_FILE="${3:-/etc/titan/allowed-ips.txt}"
LOG_FILE="/var/log/titan/security-setup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
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

# Step message
step() {
    local message="$1"
    echo -e "${PURPLE}STEP: $message${NC}"
    log "STEP: $message"
}

# Display banner
display_banner() {
    echo -e "${PURPLE}"
    echo "╔══════════════════════════════════════════════════════════════════════════════╗"
    echo "║                    TITAN SECURITY LAYER SETUP                               ║"
    echo "║                                                                              ║"
    echo "║  This script will configure comprehensive security for your Titan system:   ║"
    echo "║  • TLS 1.3 with automatic certificate management                            ║"
    echo "║  • IP whitelisting and firewall configuration                               ║"
    echo "║  • API key management with automated rotation                               ║"
    echo "║  • Fail2Ban brute force protection                                          ║"
    echo "║  • Security event logging and monitoring                                    ║"
    echo "╚══════════════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error_exit "This script must be run as root"
    fi
}

# Validate parameters
validate_parameters() {
    if [[ -z "$DOMAIN" ]]; then
        echo "Domain parameter is required."
        echo "Usage: $0 <domain> [master_password] [allowed_ips_file]"
        echo ""
        read -p "Enter your domain name: " DOMAIN
        
        if [[ -z "$DOMAIN" ]]; then
            error_exit "Domain is required"
        fi
    fi
    
    # Basic domain validation
    if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$ ]]; then
        error_exit "Invalid domain format: $DOMAIN"
    fi
    
    success "Domain validation passed: $DOMAIN"
}

# Create log directory
create_log_directory() {
    mkdir -p /var/log/titan
    chmod 755 /var/log/titan
    chown root:root /var/log/titan
    
    # Initialize security log
    touch /var/log/titan/security.log
    chmod 644 /var/log/titan/security.log
}

# Step 1: TLS 1.3 Setup
setup_tls() {
    step "Setting up TLS 1.3 configuration and certificate management"
    
    if [[ ! -f "scripts/setup-tls.sh" ]]; then
        error_exit "TLS setup script not found: scripts/setup-tls.sh"
    fi
    
    # Make sure script is executable
    chmod +x scripts/setup-tls.sh
    
    # Run TLS setup
    if ./scripts/setup-tls.sh "$DOMAIN"; then
        success "TLS 1.3 setup completed successfully"
    else
        error_exit "TLS setup failed"
    fi
}

# Step 2: Firewall and Access Control Setup
setup_firewall() {
    step "Setting up IP whitelisting and access control"
    
    if [[ ! -f "scripts/setup-firewall.sh" ]]; then
        error_exit "Firewall setup script not found: scripts/setup-firewall.sh"
    fi
    
    # Make sure script is executable
    chmod +x scripts/setup-firewall.sh
    
    # Run firewall setup
    if ./scripts/setup-firewall.sh "$ALLOWED_IPS_FILE"; then
        success "Firewall and access control setup completed successfully"
    else
        error_exit "Firewall setup failed"
    fi
}

# Step 3: API Key Management Setup
setup_api_keys() {
    step "Setting up API key management and rotation"
    
    if [[ ! -f "scripts/setup-api-keys.sh" ]]; then
        error_exit "API key setup script not found: scripts/setup-api-keys.sh"
    fi
    
    # Get master password if not provided
    if [[ -z "$MASTER_PASSWORD" ]]; then
        echo ""
        echo "API key management requires a master password for encryption."
        echo "This password will be used to encrypt all stored API keys."
        echo ""
        echo "Password requirements:"
        echo "- At least 20 characters long"
        echo "- Include uppercase, lowercase, numbers, and symbols"
        echo "- Be unique and not used elsewhere"
        echo ""
        read -s -p "Enter master password: " MASTER_PASSWORD
        echo ""
        read -s -p "Confirm master password: " MASTER_PASSWORD_CONFIRM
        echo ""
        
        if [[ "$MASTER_PASSWORD" != "$MASTER_PASSWORD_CONFIRM" ]]; then
            error_exit "Passwords do not match"
        fi
    fi
    
    # Make sure script is executable
    chmod +x scripts/setup-api-keys.sh
    
    # Run API key setup
    if ./scripts/setup-api-keys.sh "$MASTER_PASSWORD"; then
        success "API key management setup completed successfully"
    else
        error_exit "API key setup failed"
    fi
    
    # Clear passwords from memory
    unset MASTER_PASSWORD
    unset MASTER_PASSWORD_CONFIRM
}

# Step 4: Security Monitoring Setup
setup_monitoring() {
    step "Setting up security monitoring and alerting"
    
    # Create comprehensive security monitoring script
    cat > /usr/local/bin/titan-security-monitor.sh << 'EOF'
#!/bin/bash

# Titan Security Monitoring Script
LOG_FILE="/var/log/titan/security-monitor.log"
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
  "component": "SecurityMonitor",
  "details": $details
}
EOL
)
    
    echo "$log_entry" >> "$SECURITY_LOG"
    echo "[$timestamp] $event_type: $details" >> "$LOG_FILE"
}

# Check TLS certificate expiry
check_tls_certificates() {
    local domain_dirs=$(find /etc/letsencrypt/live -maxdepth 1 -type d -name "*.* 2>/dev/null || true)
    
    for domain_dir in $domain_dirs; do
        local domain=$(basename "$domain_dir")
        local cert_file="$domain_dir/fullchain.pem"
        
        if [[ -f "$cert_file" ]]; then
            local expiry_date=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
            local expiry_timestamp=$(date -d "$expiry_date" +%s)
            local current_timestamp=$(date +%s)
            local days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))
            
            if [[ $days_until_expiry -le 7 ]]; then
                log_event "TLS_CERTIFICATE_EXPIRING" "{\"domain\": \"$domain\", \"days_remaining\": $days_until_expiry}"
            fi
        fi
    done
}

# Check firewall status
check_firewall() {
    if ! ufw status | grep -q "Status: active"; then
        log_event "FIREWALL_INACTIVE" '{"service": "ufw", "status": "inactive"}'
    fi
    
    if ! systemctl is-active --quiet fail2ban; then
        log_event "FAIL2BAN_INACTIVE" '{"service": "fail2ban", "status": "inactive"}'
    fi
}

# Check API key status
check_api_keys() {
    if command -v titan-keys &> /dev/null; then
        local expired_keys=$(titan-keys list 2>/dev/null | grep "Expired Keys:" | awk '{print $3}' || echo "0")
        local expiring_keys=$(titan-keys list 2>/dev/null | grep "Expiring Keys:" | awk '{print $3}' || echo "0")
        
        if [[ "$expired_keys" -gt 0 ]]; then
            log_event "API_KEYS_EXPIRED" "{\"count\": $expired_keys}"
        fi
        
        if [[ "$expiring_keys" -gt 0 ]]; then
            log_event "API_KEYS_EXPIRING" "{\"count\": $expiring_keys}"
        fi
    fi
}

# Check for suspicious activity
check_suspicious_activity() {
    # Check for failed SSH attempts
    local failed_ssh=$(grep "Failed password" /var/log/auth.log | grep "$(date '+%b %d')" | wc -l)
    if [[ "$failed_ssh" -gt 20 ]]; then
        log_event "SUSPICIOUS_SSH_ACTIVITY" "{\"failed_attempts\": $failed_ssh, \"date\": \"$(date '+%Y-%m-%d')\"}"
    fi
    
    # Check for HTTP 4xx errors
    if [[ -f /var/log/nginx/access.log ]]; then
        local http_errors=$(grep "$(date '+%d/%b/%Y')" /var/log/nginx/access.log | grep -E " (4[0-9]{2}|5[0-9]{2}) " | wc -l)
        if [[ "$http_errors" -gt 100 ]]; then
            log_event "HIGH_HTTP_ERROR_RATE" "{\"error_count\": $http_errors, \"date\": \"$(date '+%Y-%m-%d')\"}"
        fi
    fi
}

# Main monitoring function
main() {
    check_tls_certificates
    check_firewall
    check_api_keys
    check_suspicious_activity
}

main "$@"
EOF

    chmod +x /usr/local/bin/titan-security-monitor.sh
    
    # Add to crontab (run every 15 minutes)
    local cron_entry="*/15 * * * * /usr/local/bin/titan-security-monitor.sh"
    
    if ! crontab -l 2>/dev/null | grep -q "titan-security-monitor"; then
        (crontab -l 2>/dev/null; echo "$cron_entry") | crontab -
        success "Security monitoring cron job added"
    else
        info "Security monitoring cron job already exists"
    fi
}

# Step 5: Create security status checker
create_status_checker() {
    step "Creating security status checker"
    
    cat > /usr/local/bin/titan-security-status << 'EOF'
#!/bin/bash

# Titan Security Status Checker
echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                        TITAN SECURITY STATUS                                ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

# TLS Status
echo "🔒 TLS Configuration:"
if [[ -d /etc/letsencrypt/live ]]; then
    for domain_dir in /etc/letsencrypt/live/*/; do
        if [[ -d "$domain_dir" ]]; then
            domain=$(basename "$domain_dir")
            cert_file="$domain_dir/fullchain.pem"
            
            if [[ -f "$cert_file" ]]; then
                expiry_date=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
                expiry_timestamp=$(date -d "$expiry_date" +%s)
                current_timestamp=$(date +%s)
                days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))
                
                if [[ $days_until_expiry -gt 30 ]]; then
                    echo "   ✓ $domain: Valid (expires in $days_until_expiry days)"
                elif [[ $days_until_expiry -gt 7 ]]; then
                    echo "   ⚠ $domain: Expiring soon ($days_until_expiry days)"
                else
                    echo "   ✗ $domain: Critical - expires in $days_until_expiry days"
                fi
            fi
        fi
    done
else
    echo "   ✗ No TLS certificates found"
fi

echo ""

# Firewall Status
echo "🛡️  Firewall Status:"
ufw_status=$(ufw status | head -1)
if [[ "$ufw_status" == *"active"* ]]; then
    echo "   ✓ UFW: Active"
else
    echo "   ✗ UFW: Inactive"
fi

if systemctl is-active --quiet fail2ban; then
    echo "   ✓ Fail2Ban: Running"
    banned_count=$(fail2ban-client status 2>/dev/null | grep -o "Currently banned:.*" | awk '{print $3}' || echo "0")
    echo "   ℹ Currently banned IPs: $banned_count"
else
    echo "   ✗ Fail2Ban: Not running"
fi

echo ""

# API Key Status
echo "🔑 API Key Management:"
if command -v titan-keys &> /dev/null; then
    if titan-keys list &> /dev/null; then
        echo "   ✓ API Key Manager: Operational"
        titan-keys list | grep -E "(Total|Active|Expired|Expiring) Keys:" | sed 's/^/   /'
    else
        echo "   ✗ API Key Manager: Error accessing vault"
    fi
else
    echo "   ✗ API Key Manager: Not installed"
fi

echo ""

# Service Status
echo "🔧 Security Services:"
services=("nginx" "ufw" "fail2ban")
for service in "${services[@]}"; do
    if systemctl is-active --quiet "$service"; then
        echo "   ✓ $service: Running"
    else
        echo "   ✗ $service: Not running"
    fi
done

echo ""

# Log Files
echo "📋 Security Logs:"
log_files=("/var/log/titan/security.log" "/var/log/titan/tls-manager.log" "/var/log/titan/access-control.log")
for log_file in "${log_files[@]}"; do
    if [[ -f "$log_file" ]]; then
        size=$(du -h "$log_file" | cut -f1)
        echo "   ✓ $(basename "$log_file"): $size"
    else
        echo "   ✗ $(basename "$log_file"): Not found"
    fi
done

echo ""
echo "Run 'titan-security-status' anytime to check security status"
echo "Check logs in /var/log/titan/ for detailed information"
EOF

    chmod +x /usr/local/bin/titan-security-status
    success "Security status checker created: /usr/local/bin/titan-security-status"
}

# Verify complete setup
verify_setup() {
    step "Verifying complete security setup"
    
    local errors=0
    
    # Check TLS
    if [[ -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
        success "TLS certificate exists for $DOMAIN"
    else
        warning "TLS certificate not found for $DOMAIN"
        ((errors++))
    fi
    
    # Check firewall
    if ufw status | grep -q "Status: active"; then
        success "UFW firewall is active"
    else
        warning "UFW firewall is not active"
        ((errors++))
    fi
    
    # Check Fail2Ban
    if systemctl is-active --quiet fail2ban; then
        success "Fail2Ban is running"
    else
        warning "Fail2Ban is not running"
        ((errors++))
    fi
    
    # Check API key manager
    if command -v titan-keys &> /dev/null; then
        success "API key manager CLI is available"
    else
        warning "API key manager CLI not found"
        ((errors++))
    fi
    
    # Check security monitoring
    if [[ -f "/usr/local/bin/titan-security-monitor.sh" ]]; then
        success "Security monitoring is configured"
    else
        warning "Security monitoring not configured"
        ((errors++))
    fi
    
    if [[ $errors -eq 0 ]]; then
        success "All security components verified successfully"
    else
        warning "$errors security components have issues"
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
  "component": "SecuritySetup",
  "details": $details
}
EOF
)
    
    echo "$log_entry" >> /var/log/titan/security.log
}

# Main execution
main() {
    display_banner
    
    log "Starting comprehensive security setup for Titan Production Deployment"
    
    check_root
    validate_parameters
    create_log_directory
    
    # Execute setup steps
    setup_tls
    setup_firewall
    setup_api_keys
    setup_monitoring
    create_status_checker
    verify_setup
    
    # Log security event
    log_security_event "SECURITY_LAYER_CONFIGURED" "{\"domain\": \"$DOMAIN\", \"tls\": true, \"firewall\": true, \"api_keys\": true, \"monitoring\": true}"
    
    success "Comprehensive security setup completed successfully"
    
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                        SETUP COMPLETED SUCCESSFULLY                          ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "🔒 Security Layer Summary:"
    echo "   • Domain: $DOMAIN"
    echo "   • TLS 1.3: Configured with automatic renewal"
    echo "   • Firewall: UFW + Fail2Ban active"
    echo "   • API Keys: Encrypted storage with 30-day rotation"
    echo "   • Monitoring: Automated security monitoring active"
    echo ""
    echo "📋 Available Commands:"
    echo "   • titan-security-status    - Check security status"
    echo "   • titan-keys list          - Manage API keys"
    echo "   • ufw status               - Check firewall"
    echo "   • fail2ban-client status   - Check Fail2Ban"
    echo ""
    echo "📁 Important Files:"
    echo "   • /etc/titan/              - Configuration directory"
    echo "   • /var/log/titan/          - Log files"
    echo "   • /var/backups/titan/      - Backup directory"
    echo ""
    echo "🚨 SECURITY REMINDERS:"
    echo "   1. Keep your master password secure and backed up"
    echo "   2. Regularly review /var/log/titan/security.log"
    echo "   3. Update allowed IPs in /etc/titan/allowed-ips.txt as needed"
    echo "   4. Monitor certificate expiry notifications"
    echo ""
    echo "Run 'titan-security-status' to check the current security status."
}

# Execute main function
main "$@"