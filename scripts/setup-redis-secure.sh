#!/bin/bash

# Setup Redis with Secure Configuration
# 
# This script configures Redis with authentication and secure settings
# for production use in the Titan trading system.

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REDIS_CONF_TEMPLATE="$PROJECT_ROOT/config/redis-secure.conf"
REDIS_CONF_TARGET="/etc/redis/redis.conf"
ENV_FILE="$PROJECT_ROOT/.env"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Generate secure Redis password
generate_redis_password() {
    local password=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
    echo "$password"
}

# Check if Redis is installed
check_redis_installed() {
    if ! command -v redis-server &> /dev/null; then
        log_error "Redis is not installed"
        log_info "Install Redis with: sudo apt-get install redis-server"
        exit 1
    fi
    
    log_success "Redis is installed"
}

# Backup existing Redis configuration
backup_redis_config() {
    if [[ -f "$REDIS_CONF_TARGET" ]]; then
        local backup_file="${REDIS_CONF_TARGET}.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$REDIS_CONF_TARGET" "$backup_file"
        log_success "Backed up existing Redis configuration to: $backup_file"
    fi
}

# Configure Redis with secure settings
configure_redis() {
    local redis_password="$1"
    
    log_info "Configuring Redis with secure settings..."
    
    # Copy template configuration
    if [[ ! -f "$REDIS_CONF_TEMPLATE" ]]; then
        log_error "Redis configuration template not found: $REDIS_CONF_TEMPLATE"
        exit 1
    fi
    
    # Replace password placeholder
    sed "s/\${REDIS_PASSWORD}/$redis_password/g" "$REDIS_CONF_TEMPLATE" > "$REDIS_CONF_TARGET"
    
    # Set proper permissions
    chmod 640 "$REDIS_CONF_TARGET"
    chown redis:redis "$REDIS_CONF_TARGET"
    
    log_success "Redis configuration updated"
}

# Save Redis password to environment file
save_redis_password() {
    local redis_password="$1"
    
    log_info "Saving Redis password to environment file..."
    
    # Create .env file if it doesn't exist
    if [[ ! -f "$ENV_FILE" ]]; then
        touch "$ENV_FILE"
        chmod 600 "$ENV_FILE"
    fi
    
    # Remove existing REDIS_PASSWORD if present
    sed -i '/^REDIS_PASSWORD=/d' "$ENV_FILE"
    
    # Add new password
    echo "REDIS_PASSWORD=$redis_password" >> "$ENV_FILE"
    
    log_success "Redis password saved to: $ENV_FILE"
    log_warning "Keep this file secure and never commit it to version control!"
}

# Restart Redis service
restart_redis() {
    log_info "Restarting Redis service..."
    
    systemctl restart redis
    
    # Wait for Redis to start
    sleep 2
    
    if systemctl is-active --quiet redis; then
        log_success "Redis service restarted successfully"
    else
        log_error "Failed to restart Redis service"
        exit 1
    fi
}

# Test Redis connection with password
test_redis_connection() {
    local redis_password="$1"
    
    log_info "Testing Redis connection..."
    
    if redis-cli -a "$redis_password" ping | grep -q "PONG"; then
        log_success "Redis connection test passed"
    else
        log_error "Redis connection test failed"
        exit 1
    fi
    
    # Test authentication requirement
    if redis-cli ping 2>&1 | grep -q "NOAUTH"; then
        log_success "Redis authentication is properly configured"
    else
        log_warning "Redis may not require authentication"
    fi
}

# Display connection information
display_connection_info() {
    local redis_password="$1"
    
    echo ""
    log_info "Redis Configuration Complete"
    echo ""
    echo "Connection Details:"
    echo "  Host: localhost"
    echo "  Port: 6379"
    echo "  Password: $redis_password"
    echo ""
    echo "Connection String:"
    echo "  redis://localhost:6379"
    echo ""
    echo "CLI Connection:"
    echo "  redis-cli -a '$redis_password'"
    echo ""
    echo "Node.js Connection:"
    echo "  const redis = require('redis');"
    echo "  const client = redis.createClient({"
    echo "    host: 'localhost',"
    echo "    port: 6379,"
    echo "    password: process.env.REDIS_PASSWORD"
    echo "  });"
    echo ""
    log_warning "Store the password securely in your .env file"
    log_warning "Never commit the .env file to version control"
}

# Show usage
show_usage() {
    cat << EOF
Setup Redis with Secure Configuration

Usage: sudo $0 [options]

Options:
  --password <password>    Use specific password (default: auto-generate)
  --skip-restart          Don't restart Redis service
  --test-only             Only test existing configuration
  --help                  Show this help message

Examples:
  sudo $0                                    # Auto-generate password and configure
  sudo $0 --password "my-secure-password"   # Use specific password
  sudo $0 --test-only                       # Test existing configuration

EOF
}

# Main execution
main() {
    local redis_password=""
    local skip_restart=false
    local test_only=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --password)
                redis_password="$2"
                shift 2
                ;;
            --skip-restart)
                skip_restart=true
                shift
                ;;
            --test-only)
                test_only=true
                shift
                ;;
            --help)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Check prerequisites
    check_root
    check_redis_installed
    
    # Test only mode
    if [[ "$test_only" == true ]]; then
        log_info "Testing Redis configuration..."
        
        if [[ -z "$redis_password" ]]; then
            # Try to read password from .env file
            if [[ -f "$ENV_FILE" ]]; then
                redis_password=$(grep "^REDIS_PASSWORD=" "$ENV_FILE" | cut -d'=' -f2)
            fi
            
            if [[ -z "$redis_password" ]]; then
                log_error "No password provided and none found in .env file"
                exit 1
            fi
        fi
        
        test_redis_connection "$redis_password"
        exit 0
    fi
    
    # Generate password if not provided
    if [[ -z "$redis_password" ]]; then
        log_info "Generating secure Redis password..."
        redis_password=$(generate_redis_password)
        log_success "Password generated"
    fi
    
    # Backup existing configuration
    backup_redis_config
    
    # Configure Redis
    configure_redis "$redis_password"
    
    # Save password to environment file
    save_redis_password "$redis_password"
    
    # Restart Redis if not skipped
    if [[ "$skip_restart" == false ]]; then
        restart_redis
    fi
    
    # Test connection
    test_redis_connection "$redis_password"
    
    # Display connection information
    display_connection_info "$redis_password"
    
    log_success "Redis secure setup completed successfully!"
}

# Execute main function
main "$@"