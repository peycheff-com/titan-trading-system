#!/bin/bash

# API Key Management Setup Script for Titan Production Deployment
# Requirements: 4.2, 3.2

set -euo pipefail

# Configuration
MASTER_PASSWORD="${1:-}"
CONFIG_DIR="/etc/titan"
VAULT_PATH="$CONFIG_DIR/api-keys.vault"
LOG_FILE="/var/log/titan/api-key-setup.log"
SERVICE_FILE="/etc/systemd/system/titan-key-manager.service"

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

# Validate master password
validate_master_password() {
    if [[ -z "$MASTER_PASSWORD" ]]; then
        echo "Master password is required for API key encryption."
        echo "Usage: $0 <master_password>"
        echo ""
        echo "The master password should be:"
        echo "- At least 20 characters long"
        echo "- Include uppercase, lowercase, numbers, and symbols"
        echo "- Be unique and not used elsewhere"
        echo ""
        read -s -p "Enter master password: " MASTER_PASSWORD
        echo ""
        
        if [[ ${#MASTER_PASSWORD} -lt 20 ]]; then
            error_exit "Master password must be at least 20 characters long"
        fi
    fi
    
    # Basic password strength check
    if [[ ${#MASTER_PASSWORD} -lt 20 ]]; then
        error_exit "Master password must be at least 20 characters long"
    fi
    
    if ! [[ "$MASTER_PASSWORD" =~ [A-Z] ]]; then
        error_exit "Master password must contain at least one uppercase letter"
    fi
    
    if ! [[ "$MASTER_PASSWORD" =~ [a-z] ]]; then
        error_exit "Master password must contain at least one lowercase letter"
    fi
    
    if ! [[ "$MASTER_PASSWORD" =~ [0-9] ]]; then
        error_exit "Master password must contain at least one number"
    fi
    
    if ! [[ "$MASTER_PASSWORD" =~ [^a-zA-Z0-9] ]]; then
        error_exit "Master password must contain at least one special character"
    fi
    
    success "Master password validation passed"
}

# Create necessary directories
create_directories() {
    log "Creating necessary directories..."
    
    mkdir -p "$CONFIG_DIR"
    mkdir -p /var/log/titan
    mkdir -p /var/backups/titan/keys
    mkdir -p /opt/titan/services/security
    
    # Set secure permissions
    chmod 700 "$CONFIG_DIR"
    chmod 700 /var/backups/titan/keys
    chmod 755 /var/log/titan
    
    chown root:root "$CONFIG_DIR"
    chown root:root /var/backups/titan/keys
    chown root:root /var/log/titan
    
    success "Directories created with secure permissions"
}

# Install Node.js dependencies
install_dependencies() {
    log "Installing Node.js dependencies..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        error_exit "Node.js is not installed. Please install Node.js 18+ first."
    fi
    
    # Check Node.js version
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ $node_version -lt 18 ]]; then
        error_exit "Node.js version 18 or higher is required. Current version: $(node --version)"
    fi
    
    # Install TypeScript globally if not present
    if ! command -v tsc &> /dev/null; then
        npm install -g typescript
    fi
    
    success "Dependencies verified"
}

# Build the security service
build_security_service() {
    log "Building security service..."
    
    local security_dir="/opt/titan/services/security"
    
    # Copy source files
    cp -r services/security/* "$security_dir/"
    
    # Install npm dependencies
    cd "$security_dir"
    npm install --production
    
    # Build TypeScript
    npm run build
    
    # Set permissions
    chmod 755 "$security_dir"
    chmod 600 "$security_dir"/*.ts "$security_dir"/*.json
    
    success "Security service built successfully"
}

# Create API key management CLI
create_cli_tool() {
    log "Creating API key management CLI tool..."
    
    cat > /usr/local/bin/titan-keys << 'EOF'
#!/bin/bash

# Titan API Key Management CLI
# Usage: titan-keys <command> [options]

SECURITY_DIR="/opt/titan/services/security"
MASTER_PASSWORD_FILE="/etc/titan/.master_password"

# Load master password
if [[ -f "$MASTER_PASSWORD_FILE" ]]; then
    MASTER_PASSWORD=$(cat "$MASTER_PASSWORD_FILE")
else
    echo "Error: Master password file not found"
    exit 1
fi

# Export for Node.js script
export TITAN_MASTER_PASSWORD="$MASTER_PASSWORD"

case "$1" in
    "list")
        node -e "
        const { APIKeyManager } = require('$SECURITY_DIR/dist/APIKeyManager.js');
        const manager = new APIKeyManager();
        manager.initialize(process.env.TITAN_MASTER_PASSWORD)
          .then(() => manager.getRotationStatus())
          .then(status => {
            console.log('API Key Status:');
            console.log('Total Keys:', status.totalKeys);
            console.log('Active Keys:', status.activeKeys);
            console.log('Expired Keys:', status.expiredKeys);
            console.log('Expiring Keys:', status.expiringKeys);
            console.log('Next Rotation:', status.nextRotation);
            console.log('Last Rotation:', status.lastRotation);
          })
          .catch(error => {
            console.error('Error:', error.message);
            process.exit(1);
          });
        "
        ;;
    "add")
        if [[ $# -lt 4 ]]; then
            echo "Usage: titan-keys add <name> <service> <key> [secret]"
            exit 1
        fi
        
        node -e "
        const { APIKeyManager } = require('$SECURITY_DIR/dist/APIKeyManager.js');
        const manager = new APIKeyManager();
        manager.initialize(process.env.TITAN_MASTER_PASSWORD)
          .then(() => manager.storeAPIKey('$2', '$4', '$5', '$3', 'production'))
          .then(keyId => {
            console.log('API key stored successfully. ID:', keyId);
          })
          .catch(error => {
            console.error('Error:', error.message);
            process.exit(1);
          });
        "
        ;;
    "rotate")
        if [[ $# -lt 2 ]]; then
            echo "Usage: titan-keys rotate <key_id> [new_key] [new_secret]"
            exit 1
        fi
        
        # Generate new key if not provided
        NEW_KEY="${3:-$(openssl rand -hex 32)}"
        NEW_SECRET="${4:-$(openssl rand -base64 64)}"
        
        node -e "
        const { APIKeyManager } = require('$SECURITY_DIR/dist/APIKeyManager.js');
        const manager = new APIKeyManager();
        manager.initialize(process.env.TITAN_MASTER_PASSWORD)
          .then(() => manager.rotateAPIKey('$2', '$NEW_KEY', '$NEW_SECRET'))
          .then(result => {
            if (result.success) {
              console.log('API key rotated successfully');
              console.log('Key ID:', result.keyId);
              console.log('Rotation time:', result.rotationTime + 'ms');
            } else {
              console.error('Rotation failed:', result.error);
              process.exit(1);
            }
          })
          .catch(error => {
            console.error('Error:', error.message);
            process.exit(1);
          });
        "
        ;;
    "auto-rotate")
        node -e "
        const { APIKeyManager } = require('$SECURITY_DIR/dist/APIKeyManager.js');
        const manager = new APIKeyManager();
        manager.initialize(process.env.TITAN_MASTER_PASSWORD)
          .then(() => manager.autoRotateExpiredKeys())
          .then(results => {
            console.log('Auto-rotation completed');
            console.log('Keys processed:', results.length);
            results.forEach(result => {
              if (result.success) {
                console.log('✓ Rotated:', result.keyId);
              } else {
                console.log('✗ Failed:', result.keyId, '-', result.error);
              }
            });
          })
          .catch(error => {
            console.error('Error:', error.message);
            process.exit(1);
          });
        "
        ;;
    "revoke")
        if [[ $# -lt 2 ]]; then
            echo "Usage: titan-keys revoke <key_id> [reason]"
            exit 1
        fi
        
        node -e "
        const { APIKeyManager } = require('$SECURITY_DIR/dist/APIKeyManager.js');
        const manager = new APIKeyManager();
        manager.initialize(process.env.TITAN_MASTER_PASSWORD)
          .then(() => manager.revokeAPIKey('$2', '$3'))
          .then(() => {
            console.log('API key revoked successfully');
          })
          .catch(error => {
            console.error('Error:', error.message);
            process.exit(1);
          });
        "
        ;;
    "help"|*)
        echo "Titan API Key Management CLI"
        echo ""
        echo "Usage: titan-keys <command> [options]"
        echo ""
        echo "Commands:"
        echo "  list                           List API key status"
        echo "  add <name> <service> <key> [secret]  Add new API key"
        echo "  rotate <key_id> [key] [secret] Rotate API key"
        echo "  auto-rotate                    Auto-rotate expired keys"
        echo "  revoke <key_id> [reason]       Revoke API key"
        echo "  help                           Show this help"
        echo ""
        echo "Examples:"
        echo "  titan-keys list"
        echo "  titan-keys add bybit-prod bybit abc123 def456"
        echo "  titan-keys rotate key-id-123"
        echo "  titan-keys auto-rotate"
        echo "  titan-keys revoke key-id-123 'Compromised'"
        ;;
esac
EOF

    chmod +x /usr/local/bin/titan-keys
    success "CLI tool created: /usr/local/bin/titan-keys"
}

# Create systemd service for key rotation
create_systemd_service() {
    log "Creating systemd service for key rotation..."
    
    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Titan API Key Rotation Service
After=network.target

[Service]
Type=oneshot
User=root
Environment=TITAN_MASTER_PASSWORD_FILE=/etc/titan/.master_password
ExecStart=/usr/local/bin/titan-keys auto-rotate
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    # Create timer for daily execution
    cat > /etc/systemd/system/titan-key-manager.timer << EOF
[Unit]
Description=Run Titan API Key Rotation Daily
Requires=titan-key-manager.service

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
EOF

    # Reload systemd and enable timer
    systemctl daemon-reload
    systemctl enable titan-key-manager.timer
    systemctl start titan-key-manager.timer
    
    success "Systemd service and timer created"
}

# Store master password securely
store_master_password() {
    log "Storing master password securely..."
    
    local password_file="/etc/titan/.master_password"
    
    # Store password with secure permissions
    echo "$MASTER_PASSWORD" > "$password_file"
    chmod 600 "$password_file"
    chown root:root "$password_file"
    
    # Also set as environment variable for current session
    export TITAN_MASTER_PASSWORD="$MASTER_PASSWORD"
    
    success "Master password stored securely"
}

# Initialize the API key vault
initialize_vault() {
    log "Initializing API key vault..."
    
    # Use the CLI tool to initialize (this will create the vault)
    export TITAN_MASTER_PASSWORD="$MASTER_PASSWORD"
    
    node -e "
    const { APIKeyManager } = require('/opt/titan/services/security/dist/APIKeyManager.js');
    const manager = new APIKeyManager();
    manager.initialize(process.env.TITAN_MASTER_PASSWORD)
      .then(() => {
        console.log('API key vault initialized successfully');
      })
      .catch(error => {
        console.error('Vault initialization failed:', error.message);
        process.exit(1);
      });
    " || error_exit "Failed to initialize API key vault"
    
    success "API key vault initialized"
}

# Create rotation monitoring script
create_monitoring_script() {
    log "Creating rotation monitoring script..."
    
    cat > /usr/local/bin/titan-key-monitor.sh << 'EOF'
#!/bin/bash

# Titan API Key Monitoring Script
LOG_FILE="/var/log/titan/key-monitor.log"
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
  "component": "KeyMonitor",
  "details": $details
}
EOL
)
    
    echo "$log_entry" >> "$SECURITY_LOG"
    echo "[$timestamp] $event_type: $details" >> "$LOG_FILE"
}

# Check for expiring keys
EXPIRING_KEYS=$(titan-keys list 2>/dev/null | grep "Expiring Keys:" | awk '{print $3}' || echo "0")
if [[ "$EXPIRING_KEYS" -gt 0 ]]; then
    log_event "KEYS_EXPIRING_SOON" "{\"count\": $EXPIRING_KEYS}"
fi

# Check for expired keys
EXPIRED_KEYS=$(titan-keys list 2>/dev/null | grep "Expired Keys:" | awk '{print $3}' || echo "0")
if [[ "$EXPIRED_KEYS" -gt 0 ]]; then
    log_event "KEYS_EXPIRED" "{\"count\": $EXPIRED_KEYS}"
fi

# Check vault file permissions
VAULT_FILE="/etc/titan/api-keys.vault"
if [[ -f "$VAULT_FILE" ]]; then
    VAULT_PERMS=$(stat -c "%a" "$VAULT_FILE")
    if [[ "$VAULT_PERMS" != "600" ]]; then
        log_event "VAULT_INSECURE_PERMISSIONS" "{\"permissions\": \"$VAULT_PERMS\", \"expected\": \"600\"}"
        chmod 600 "$VAULT_FILE"
    fi
fi
EOF

    chmod +x /usr/local/bin/titan-key-monitor.sh
    
    # Add to crontab (run every hour)
    local cron_entry="0 * * * * /usr/local/bin/titan-key-monitor.sh"
    
    if ! crontab -l 2>/dev/null | grep -q "titan-key-monitor"; then
        (crontab -l 2>/dev/null; echo "$cron_entry") | crontab -
        success "Key monitoring cron job added"
    else
        info "Key monitoring cron job already exists"
    fi
}

# Test the setup
test_setup() {
    log "Testing API key management setup..."
    
    # Test CLI tool
    if titan-keys help > /dev/null 2>&1; then
        success "CLI tool is working"
    else
        error_exit "CLI tool test failed"
    fi
    
    # Test vault access
    if titan-keys list > /dev/null 2>&1; then
        success "Vault access is working"
    else
        error_exit "Vault access test failed"
    fi
    
    # Test systemd timer
    if systemctl is-active --quiet titan-key-manager.timer; then
        success "Systemd timer is active"
    else
        warning "Systemd timer is not active"
    fi
    
    success "API key management setup test completed"
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
  "component": "APIKeySetup",
  "details": $details
}
EOF
)
    
    echo "$log_entry" >> /var/log/titan/security.log
}

# Main execution
main() {
    log "Starting API key management setup..."
    
    check_root
    validate_master_password
    create_directories
    install_dependencies
    build_security_service
    store_master_password
    create_cli_tool
    create_systemd_service
    initialize_vault
    create_monitoring_script
    test_setup
    
    # Clear master password from memory
    unset MASTER_PASSWORD
    
    # Log security event
    log_security_event "API_KEY_MANAGEMENT_CONFIGURED" '{"auto_rotation": true, "encryption": "AES-256-GCM"}'
    
    success "API key management setup completed successfully"
    
    echo ""
    echo "=== API Key Management Setup Summary ==="
    echo "Vault Location: $VAULT_PATH"
    echo "CLI Tool: /usr/local/bin/titan-keys"
    echo "Service: titan-key-manager.service"
    echo "Timer: titan-key-manager.timer (daily rotation check)"
    echo "Monitoring: /usr/local/bin/titan-key-monitor.sh (hourly)"
    echo "Logs: /var/log/titan/"
    echo ""
    echo "Usage Examples:"
    echo "  titan-keys list                    # Show key status"
    echo "  titan-keys add mykey bybit abc123  # Add new key"
    echo "  titan-keys rotate key-id-123       # Rotate specific key"
    echo "  titan-keys auto-rotate             # Rotate all expired keys"
    echo ""
    echo "SECURITY NOTES:"
    echo "1. Master password is stored securely in /etc/titan/.master_password"
    echo "2. All API keys are encrypted with AES-256-GCM"
    echo "3. Automatic rotation occurs every 30 days"
    echo "4. All operations are logged to /var/log/titan/security.log"
    echo "5. Vault backups are created in /var/backups/titan/keys/"
}

# Execute main function
main "$@"