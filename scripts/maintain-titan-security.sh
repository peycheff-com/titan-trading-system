#!/bin/bash

# Titan Security Maintenance Script
# This script handles security updates and API key rotation for the Titan Trading System
# Requirements: 4.2, 1.5 - Implement API key rotation and configure automatic security updates

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$PROJECT_ROOT/config"
SECURITY_DIR="$PROJECT_ROOT/config/security"
LOGS_DIR="$PROJECT_ROOT/logs"
BACKUP_DIR="$PROJECT_ROOT/backups/security"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Security configuration
KEY_ROTATION_INTERVAL=30  # days
CERTIFICATE_RENEWAL_DAYS=30
SECURITY_AUDIT_ENABLED=true
AUTO_UPDATE_ENABLED=true
MAINTENANCE_MODE="manual"

# Encryption settings
ENCRYPTION_ALGORITHM="aes-256-gcm"
KEY_DERIVATION_ROUNDS=100000

# Logging functions
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

security_log() {
    local message="$1"
    local log_file="$LOGS_DIR/security.log"
    local timestamp=$(date -Iseconds)
    
    echo "[$timestamp] SECURITY: $message" >> "$log_file"
    log "$message"
}

# Create security directories
create_security_directories() {
    log "Creating security directories..."
    
    local security_dirs=(
        "$SECURITY_DIR"
        "$SECURITY_DIR/keys"
        "$SECURITY_DIR/certificates"
        "$SECURITY_DIR/backups"
        "$BACKUP_DIR"
        "$BACKUP_DIR/keys"
        "$BACKUP_DIR/certificates"
    )
    
    for dir in "${security_dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            chmod 700 "$dir"
            log "Created secure directory: $dir"
        fi
    done
    
    success "Security directories created"
}

# Generate encryption key
generate_encryption_key() {
    local key_file="$SECURITY_DIR/keys/master.key"
    
    if [[ ! -f "$key_file" ]]; then
        log "Generating master encryption key..."
        
        # Generate 256-bit key
        openssl rand -base64 32 > "$key_file"
        chmod 600 "$key_file"
        
        security_log "Master encryption key generated"
        success "Master encryption key created: $key_file"
    else
        log "Master encryption key already exists"
    fi
}

# Encrypt sensitive data
encrypt_data() {
    local input_data="$1"
    local key_file="$SECURITY_DIR/keys/master.key"
    
    if [[ ! -f "$key_file" ]]; then
        error "Master encryption key not found"
        return 1
    fi
    
    # Encrypt using AES-256-GCM
    echo "$input_data" | openssl enc -aes-256-gcm -salt -pbkdf2 -iter $KEY_DERIVATION_ROUNDS -pass file:"$key_file" -base64
}

# Decrypt sensitive data
decrypt_data() {
    local encrypted_data="$1"
    local key_file="$SECURITY_DIR/keys/master.key"
    
    if [[ ! -f "$key_file" ]]; then
        error "Master encryption key not found"
        return 1
    fi
    
    # Decrypt using AES-256-GCM
    echo "$encrypted_data" | openssl enc -aes-256-gcm -d -salt -pbkdf2 -iter $KEY_DERIVATION_ROUNDS -pass file:"$key_file" -base64
}

# Backup current API keys
backup_api_keys() {
    log "Backing up current API keys..."
    
    local backup_timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$BACKUP_DIR/keys/api_keys_backup_$backup_timestamp.enc"
    
    # Create backup of current keys
    local key_backup_data=""
    
    # Collect current API keys from environment and config files
    local env_files=(".env" ".env.production" "config/deployment/production.env")
    
    for env_file in "${env_files[@]}"; do
        local full_path="$PROJECT_ROOT/$env_file"
        if [[ -f "$full_path" ]]; then
            # Extract API key lines
            grep -E "(API_KEY|API_SECRET|WEBHOOK)" "$full_path" >> "$backup_file.tmp" 2>/dev/null || true
        fi
    done
    
    # Encrypt backup
    if [[ -f "$backup_file.tmp" ]]; then
        encrypt_data "$(cat "$backup_file.tmp")" > "$backup_file"
        rm "$backup_file.tmp"
        chmod 600 "$backup_file"
        
        security_log "API keys backed up to $backup_file"
        success "API keys backed up"
    else
        warning "No API keys found to backup"
    fi
}

# Generate new API key pair
generate_api_key_pair() {
    local exchange="$1"
    
    log "Generating new API key pair for $exchange..."
    
    # Generate random API key and secret
    local api_key=$(openssl rand -hex 16)
    local api_secret=$(openssl rand -hex 32)
    
    # Store in encrypted format
    local key_file="$SECURITY_DIR/keys/${exchange}_keys.enc"
    local key_data="API_KEY=$api_key\nAPI_SECRET=$api_secret\nGENERATED=$(date -Iseconds)"
    
    encrypt_data "$key_data" > "$key_file"
    chmod 600 "$key_file"
    
    security_log "New API key pair generated for $exchange"
    
    echo "API_KEY=$api_key"
    echo "API_SECRET=$api_secret"
}

# Rotate exchange API keys
rotate_exchange_keys() {
    log "Rotating exchange API keys..."
    
    local exchanges=("bybit" "mexc" "binance")
    local rotated_keys=()
    
    for exchange in "${exchanges[@]}"; do
        log "Processing $exchange API keys..."
        
        # Check if keys need rotation
        local key_file="$SECURITY_DIR/keys/${exchange}_keys.enc"
        local needs_rotation=false
        
        if [[ -f "$key_file" ]]; then
            # Check key age
            local key_age_days=$(( ($(date +%s) - $(stat -c %Y "$key_file" 2>/dev/null || stat -f %m "$key_file" 2>/dev/null)) / 86400 ))
            
            if [[ $key_age_days -ge $KEY_ROTATION_INTERVAL ]]; then
                needs_rotation=true
                log "$exchange keys are $key_age_days days old (rotation needed)"
            else
                log "$exchange keys are $key_age_days days old (rotation not needed)"
            fi
        else
            needs_rotation=true
            log "$exchange keys not found (initial generation needed)"
        fi
        
        if [[ "$needs_rotation" == "true" ]]; then
            # Backup current keys
            if [[ -f "$key_file" ]]; then
                local backup_file="$BACKUP_DIR/keys/${exchange}_keys_$(date +%Y%m%d_%H%M%S).enc"
                cp "$key_file" "$backup_file"
                log "Backed up current $exchange keys"
            fi
            
            # Generate new keys
            local new_keys=$(generate_api_key_pair "$exchange")
            rotated_keys+=("$exchange")
            
            warning "MANUAL ACTION REQUIRED:"
            warning "New $exchange API keys generated. You must:"
            warning "1. Log into $exchange exchange"
            warning "2. Create new API key with these credentials:"
            echo "$new_keys"
            warning "3. Update the production environment configuration"
            warning "4. Restart affected services"
            
        else
            success "$exchange keys are current (no rotation needed)"
        fi
    done
    
    if [[ ${#rotated_keys[@]} -gt 0 ]]; then
        security_log "API keys rotated for exchanges: ${rotated_keys[*]}"
        
        # Create rotation report
        local report_file="$LOGS_DIR/key_rotation_report_$(date +%Y%m%d_%H%M%S).txt"
        cat > "$report_file" << EOF
Titan API Key Rotation Report
Generated: $(date)

Rotated Exchanges: ${rotated_keys[*]}
Rotation Interval: $KEY_ROTATION_INTERVAL days

Next Steps:
1. Update exchange API keys manually
2. Update production configuration files
3. Restart affected services
4. Test connectivity and functionality

Security Notes:
- Old keys have been backed up to $BACKUP_DIR/keys/
- New keys are encrypted and stored in $SECURITY_DIR/keys/
- Monitor logs for any authentication failures

EOF
        
        success "Key rotation report generated: $report_file"
    else
        log "No API keys required rotation"
    fi
}

# Check SSL certificate expiration
check_ssl_certificates() {
    log "Checking SSL certificate expiration..."
    
    local cert_warnings=()
    local cert_paths=("/etc/ssl/certs/titan.crt" "/etc/letsencrypt/live/*/cert.pem")
    
    for cert_pattern in "${cert_paths[@]}"; do
        for cert_file in $cert_pattern; do
            if [[ -f "$cert_file" ]]; then
                local cert_name=$(basename "$(dirname "$cert_file")")
                
                # Check certificate expiration
                local expiry_date=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
                local expiry_timestamp=$(date -d "$expiry_date" +%s 2>/dev/null || echo 0)
                local current_timestamp=$(date +%s)
                local days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))
                
                if [[ $days_until_expiry -le 0 ]]; then
                    error "SSL certificate EXPIRED: $cert_name (expired $((-days_until_expiry)) days ago)"
                    cert_warnings+=("$cert_name: EXPIRED")
                elif [[ $days_until_expiry -le $CERTIFICATE_RENEWAL_DAYS ]]; then
                    warning "SSL certificate expiring soon: $cert_name ($days_until_expiry days remaining)"
                    cert_warnings+=("$cert_name: $days_until_expiry days")
                else
                    success "SSL certificate OK: $cert_name ($days_until_expiry days remaining)"
                fi
            fi
        done
    done
    
    if [[ ${#cert_warnings[@]} -gt 0 ]]; then
        security_log "SSL certificate warnings: ${cert_warnings[*]}"
        
        # Attempt automatic renewal with certbot
        if command -v certbot &> /dev/null; then
            log "Attempting automatic certificate renewal..."
            
            if sudo certbot renew --quiet --no-self-upgrade; then
                success "SSL certificates renewed successfully"
                security_log "SSL certificates automatically renewed"
                
                # Reload nginx if running
                if systemctl is-active --quiet nginx; then
                    sudo systemctl reload nginx
                    log "Nginx reloaded with new certificates"
                fi
            else
                error "Automatic certificate renewal failed"
                warning "Manual certificate renewal may be required"
            fi
        else
            warning "Certbot not available for automatic renewal"
        fi
    fi
}

# Update system security packages
update_security_packages() {
    if [[ "$AUTO_UPDATE_ENABLED" != "true" ]]; then
        log "Automatic security updates disabled"
        return 0
    fi
    
    log "Updating system security packages..."
    
    # Update package lists
    sudo apt-get update -qq
    
    # Get list of security updates
    local security_updates=$(apt list --upgradable 2>/dev/null | grep -i security | wc -l)
    
    if [[ $security_updates -gt 0 ]]; then
        log "Found $security_updates security updates"
        
        # Install security updates
        if sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"; then
            success "Security updates installed successfully"
            security_log "$security_updates security updates installed"
            
            # Check if reboot is required
            if [[ -f /var/run/reboot-required ]]; then
                warning "System reboot required for security updates"
                security_log "System reboot required after security updates"
                
                # Create reboot notification
                local reboot_file="$LOGS_DIR/reboot_required_$(date +%Y%m%d_%H%M%S).txt"
                cat > "$reboot_file" << EOF
SYSTEM REBOOT REQUIRED

Security updates have been installed that require a system reboot.
Generated: $(date)

Affected packages:
$(cat /var/run/reboot-required.pkgs 2>/dev/null || echo "Package list not available")

Recommended actions:
1. Schedule maintenance window
2. Stop Titan services gracefully
3. Reboot system
4. Verify services restart correctly
5. Test system functionality

EOF
                warning "Reboot notification created: $reboot_file"
            fi
        else
            error "Failed to install security updates"
            security_log "Failed to install security updates"
        fi
    else
        success "No security updates available"
    fi
}

# Audit security configuration
audit_security_config() {
    if [[ "$SECURITY_AUDIT_ENABLED" != "true" ]]; then
        return 0
    fi
    
    log "Performing security configuration audit..."
    
    local audit_file="$LOGS_DIR/security_audit_$(date +%Y%m%d_%H%M%S).txt"
    local audit_warnings=()
    
    cat > "$audit_file" << EOF
Titan Security Configuration Audit
Generated: $(date)

=== File Permissions ===
EOF
    
    # Check file permissions
    local sensitive_files=(
        "$SECURITY_DIR/keys"
        "$CONFIG_DIR"
        "$PROJECT_ROOT/.env"
        "$PROJECT_ROOT/.env.production"
    )
    
    for file_path in "${sensitive_files[@]}"; do
        if [[ -e "$file_path" ]]; then
            local perms=$(stat -c %a "$file_path" 2>/dev/null || stat -f %A "$file_path" 2>/dev/null)
            echo "$file_path: $perms" >> "$audit_file"
            
            # Check for overly permissive permissions
            if [[ -f "$file_path" ]] && [[ "$perms" != "600" ]] && [[ "$perms" != "644" ]]; then
                audit_warnings+=("File $file_path has permissions $perms")
            elif [[ -d "$file_path" ]] && [[ "$perms" != "700" ]] && [[ "$perms" != "755" ]]; then
                audit_warnings+=("Directory $file_path has permissions $perms")
            fi
        fi
    done
    
    # Check SSH configuration
    echo -e "\n=== SSH Configuration ===" >> "$audit_file"
    if [[ -f /etc/ssh/sshd_config ]]; then
        grep -E "^(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication)" /etc/ssh/sshd_config >> "$audit_file" 2>/dev/null || true
        
        # Check for insecure SSH settings
        if grep -q "^PermitRootLogin yes" /etc/ssh/sshd_config 2>/dev/null; then
            audit_warnings+=("SSH root login is enabled")
        fi
        
        if grep -q "^PasswordAuthentication yes" /etc/ssh/sshd_config 2>/dev/null; then
            audit_warnings+=("SSH password authentication is enabled")
        fi
    fi
    
    # Check firewall status
    echo -e "\n=== Firewall Status ===" >> "$audit_file"
    if command -v ufw &> /dev/null; then
        sudo ufw status >> "$audit_file" 2>/dev/null || true
        
        if ! sudo ufw status | grep -q "Status: active"; then
            audit_warnings+=("UFW firewall is not active")
        fi
    fi
    
    # Check fail2ban status
    echo -e "\n=== Fail2Ban Status ===" >> "$audit_file"
    if command -v fail2ban-client &> /dev/null; then
        sudo fail2ban-client status >> "$audit_file" 2>/dev/null || true
        
        if ! systemctl is-active --quiet fail2ban; then
            audit_warnings+=("Fail2ban service is not running")
        fi
    fi
    
    # Check for default passwords
    echo -e "\n=== Configuration Security ===" >> "$audit_file"
    local config_files=("$CONFIG_DIR"/*.json "$PROJECT_ROOT"/.env*)
    for config_file in $config_files; do
        if [[ -f "$config_file" ]]; then
            # Check for common default passwords
            if grep -qi "password.*123\|password.*admin\|password.*default" "$config_file" 2>/dev/null; then
                audit_warnings+=("Potential default password found in $config_file")
            fi
        fi
    done
    
    # Write audit summary
    echo -e "\n=== Audit Summary ===" >> "$audit_file"
    if [[ ${#audit_warnings[@]} -eq 0 ]]; then
        echo "No security issues found" >> "$audit_file"
        success "Security audit completed - no issues found"
    else
        echo "Security warnings found:" >> "$audit_file"
        for warning in "${audit_warnings[@]}"; do
            echo "- $warning" >> "$audit_file"
        done
        
        warning "Security audit found ${#audit_warnings[@]} issues - see $audit_file"
        security_log "Security audit found ${#audit_warnings[@]} issues"
    fi
    
    success "Security audit completed: $audit_file"
}

# Cleanup old security files
cleanup_old_security_files() {
    log "Cleaning up old security files..."
    
    local cleanup_count=0
    
    # Clean up old key backups (keep last 10)
    local key_backups=($(find "$BACKUP_DIR/keys" -name "*_keys_*.enc" -type f | sort -r))
    if [[ ${#key_backups[@]} -gt 10 ]]; then
        for ((i=10; i<${#key_backups[@]}; i++)); do
            rm "${key_backups[$i]}"
            ((cleanup_count++))
        done
    fi
    
    # Clean up old audit reports (older than 90 days)
    find "$LOGS_DIR" -name "security_audit_*.txt" -type f -mtime +90 -delete 2>/dev/null || true
    
    # Clean up old rotation reports (older than 180 days)
    find "$LOGS_DIR" -name "key_rotation_report_*.txt" -type f -mtime +180 -delete 2>/dev/null || true
    
    if [[ $cleanup_count -gt 0 ]]; then
        success "Cleaned up $cleanup_count old security files"
    else
        log "No old security files found for cleanup"
    fi
}

# Main security maintenance function
perform_security_maintenance() {
    log "Starting Titan security maintenance..."
    
    # Create security directories
    create_security_directories
    
    # Generate master encryption key if needed
    generate_encryption_key
    
    # Backup current API keys
    backup_api_keys
    
    # Rotate API keys if needed
    rotate_exchange_keys
    
    # Check SSL certificates
    check_ssl_certificates
    
    # Update security packages
    update_security_packages
    
    # Perform security audit
    audit_security_config
    
    # Cleanup old files
    cleanup_old_security_files
    
    success "Security maintenance completed successfully!"
}

# Setup automatic security maintenance
setup_security_cron() {
    log "Setting up automatic security maintenance..."
    
    local cron_script="$SCRIPT_DIR/maintain-titan-security.sh"
    local weekly_cron="0 3 * * 0 $cron_script --mode auto >> $LOGS_DIR/security_maintenance.log 2>&1"
    local daily_updates="0 4 * * * $cron_script --updates-only >> $LOGS_DIR/security_updates.log 2>&1"
    
    # Add weekly security maintenance
    if ! crontab -l 2>/dev/null | grep -q "$cron_script.*--mode auto"; then
        (crontab -l 2>/dev/null; echo "$weekly_cron") | crontab -
        success "Weekly security maintenance cron job added"
    fi
    
    # Add daily security updates
    if ! crontab -l 2>/dev/null | grep -q "$cron_script.*--updates-only"; then
        (crontab -l 2>/dev/null; echo "$daily_updates") | crontab -
        success "Daily security updates cron job added"
    fi
    
    security_log "Automatic security maintenance configured"
}

# Display security status
show_security_status() {
    log "Titan Security Status"
    echo ""
    
    # API key status
    log "API Key Status:"
    local exchanges=("bybit" "mexc" "binance")
    for exchange in "${exchanges[@]}"; do
        local key_file="$SECURITY_DIR/keys/${exchange}_keys.enc"
        if [[ -f "$key_file" ]]; then
            local key_age_days=$(( ($(date +%s) - $(stat -c %Y "$key_file" 2>/dev/null || stat -f %m "$key_file" 2>/dev/null)) / 86400 ))
            local status="OK"
            if [[ $key_age_days -ge $KEY_ROTATION_INTERVAL ]]; then
                status="ROTATION NEEDED"
            fi
            echo "  $exchange: $key_age_days days old ($status)"
        else
            echo "  $exchange: NOT CONFIGURED"
        fi
    done
    echo ""
    
    # SSL certificate status
    log "SSL Certificate Status:"
    local cert_paths=("/etc/ssl/certs/titan.crt" "/etc/letsencrypt/live/*/cert.pem")
    local cert_found=false
    
    for cert_pattern in "${cert_paths[@]}"; do
        for cert_file in $cert_pattern; do
            if [[ -f "$cert_file" ]]; then
                cert_found=true
                local cert_name=$(basename "$(dirname "$cert_file")")
                local expiry_date=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
                local expiry_timestamp=$(date -d "$expiry_date" +%s 2>/dev/null || echo 0)
                local current_timestamp=$(date +%s)
                local days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))
                
                local status="OK"
                if [[ $days_until_expiry -le 0 ]]; then
                    status="EXPIRED"
                elif [[ $days_until_expiry -le $CERTIFICATE_RENEWAL_DAYS ]]; then
                    status="EXPIRING SOON"
                fi
                
                echo "  $cert_name: $days_until_expiry days remaining ($status)"
            fi
        done
    done
    
    if [[ "$cert_found" == "false" ]]; then
        echo "  No SSL certificates found"
    fi
    echo ""
    
    # Security services status
    log "Security Services Status:"
    local services=("ufw" "fail2ban" "nginx")
    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            echo "  $service: ACTIVE"
        else
            echo "  $service: INACTIVE"
        fi
    done
    echo ""
    
    # Recent security events
    log "Recent Security Events:"
    if [[ -f "$LOGS_DIR/security.log" ]]; then
        tail -5 "$LOGS_DIR/security.log" | sed 's/^/  /'
    else
        echo "  No security log found"
    fi
}

# Display usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
    --mode MODE           Maintenance mode: auto, manual (default: manual)
    --rotate-keys         Force API key rotation regardless of age
    --updates-only        Only perform security updates (no key rotation)
    --check-certs         Only check SSL certificate expiration
    --setup-cron          Setup automatic security maintenance cron jobs
    --status              Show current security status
    --audit-only          Perform security audit only
    -h, --help           Show this help message

Examples:
    $0                                    # Full security maintenance
    $0 --mode auto                       # Automatic maintenance (for cron)
    $0 --rotate-keys                     # Force key rotation
    $0 --updates-only                    # Security updates only
    $0 --status                          # Show security status
    $0 --setup-cron                      # Setup automatic maintenance

This script will:
1. Backup current API keys
2. Rotate API keys if older than $KEY_ROTATION_INTERVAL days
3. Check SSL certificate expiration
4. Install security updates
5. Perform security configuration audit
6. Clean up old security files

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --mode)
                MAINTENANCE_MODE="$2"
                shift 2
                ;;
            --rotate-keys)
                KEY_ROTATION_INTERVAL=0
                shift
                ;;
            --updates-only)
                update_security_packages
                exit 0
                ;;
            --check-certs)
                check_ssl_certificates
                exit 0
                ;;
            --setup-cron)
                setup_security_cron
                exit 0
                ;;
            --status)
                show_security_status
                exit 0
                ;;
            --audit-only)
                create_security_directories
                audit_security_config
                exit 0
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
echo -e "${PURPLE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║         TITAN SECURITY MAINTENANCE                          ║${NC}"
echo -e "${PURPLE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

parse_args "$@"

# Validate maintenance mode
if [[ ! "$MAINTENANCE_MODE" =~ ^(auto|manual)$ ]]; then
    error "Invalid maintenance mode: $MAINTENANCE_MODE"
    usage
    exit 1
fi

# Perform security maintenance
perform_security_maintenance