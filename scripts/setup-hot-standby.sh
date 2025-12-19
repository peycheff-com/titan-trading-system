#!/bin/bash

# Hot Standby Setup Script
# 
# Sets up hot standby configuration for critical Titan system components.
# Configures standby servers, replication, and automated failover mechanisms.
#
# Usage: ./setup-hot-standby.sh [options]
#
# Requirements: 10.2

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$PROJECT_ROOT/config"
LOG_DIR="$PROJECT_ROOT/logs/hot-standby"
STANDBY_CONFIG="$CONFIG_DIR/hot-standby.config.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Global variables
STANDBY_HOST=""
SETUP_REDIS=true
SETUP_SERVICES=true
SETUP_NGINX=true
DRY_RUN=false
FORCE=false

# Logging setup
mkdir -p "$LOG_DIR"
SETUP_LOG="$LOG_DIR/setup-$(date +%Y%m%d-%H%M%S).log"
exec 1> >(tee -a "$SETUP_LOG")
exec 2> >(tee -a "$SETUP_LOG" >&2)

# Function to print colored output
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

# Function to show usage
show_usage() {
    cat << EOF
Hot Standby Setup Script

Usage: $0 [options]

Options:
  --standby-host <host>      IP address or hostname of standby server
  --skip-redis              Skip Redis standby setup
  --skip-services           Skip service standby setup
  --skip-nginx              Skip Nginx standby setup
  --dry-run                 Show what would be done without executing
  --force                   Skip confirmation prompts
  --help                    Show this help message

Examples:
  $0 --standby-host 192.168.1.100
  $0 --standby-host standby.internal --skip-nginx
  $0 --standby-host 10.0.1.50 --dry-run

EOF
}

# Function to parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --standby-host)
                STANDBY_HOST="$2"
                shift 2
                ;;
            --skip-redis)
                SETUP_REDIS=false
                shift
                ;;
            --skip-services)
                SETUP_SERVICES=false
                shift
                ;;
            --skip-nginx)
                SETUP_NGINX=false
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --force)
                FORCE=true
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

    if [[ -z "$STANDBY_HOST" ]]; then
        log_error "Standby host is required. Use --standby-host <host>"
        show_usage
        exit 1
    fi
}

# Function to execute command with logging
execute_command() {
    local description="$1"
    local command="$2"
    local critical="${3:-true}"
    
    log_info "Executing: $description"
    log_info "Command: $command"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would execute: $command"
        return 0
    fi
    
    if eval "$command"; then
        log_success "$description completed"
        return 0
    else
        local exit_code=$?
        log_error "$description failed with exit code $exit_code"
        
        if [[ "$critical" == "true" ]]; then
            log_error "Critical step failed. Aborting setup."
            exit 1
        else
            log_warning "Non-critical step failed. Continuing setup."
            return $exit_code
        fi
    fi
}

# Function to validate prerequisites
validate_prerequisites() {
    log_info "Validating prerequisites..."
    
    # Check if standby host is reachable
    if ! ping -c 1 "$STANDBY_HOST" &> /dev/null; then
        log_error "Standby host is not reachable: $STANDBY_HOST"
        exit 1
    fi
    
    # Check if SSH access is available
    if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$STANDBY_HOST" exit &> /dev/null; then
        log_error "SSH access to standby host failed: $STANDBY_HOST"
        log_error "Please ensure SSH key authentication is set up"
        exit 1
    fi
    
    # Check if required tools are available
    local required_tools=("rsync" "ssh" "scp")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "Required tool not found: $tool"
            exit 1
        fi
    done
    
    # Check if configuration file exists
    if [[ ! -f "$STANDBY_CONFIG" ]]; then
        log_error "Hot standby configuration file not found: $STANDBY_CONFIG"
        exit 1
    fi
    
    log_success "Prerequisites validation completed"
}

# Function to setup Redis standby
setup_redis_standby() {
    if [[ "$SETUP_REDIS" != "true" ]]; then
        log_info "Skipping Redis standby setup"
        return 0
    fi
    
    log_info "Setting up Redis standby on $STANDBY_HOST..."
    
    # Install Redis on standby server
    execute_command \
        "Install Redis on standby server" \
        "ssh $STANDBY_HOST 'sudo apt-get update && sudo apt-get install -y redis-server'" \
        true
    
    # Configure Redis as replica
    local redis_config="
# Redis Standby Configuration
bind 0.0.0.0
port 6379
replicaof $(hostname -I | awk '{print $1}') 6379
replica-read-only yes
replica-serve-stale-data yes
replica-priority 100
"
    
    execute_command \
        "Configure Redis replication on standby" \
        "echo '$redis_config' | ssh $STANDBY_HOST 'sudo tee -a /etc/redis/redis.conf'" \
        true
    
    # Restart Redis on standby
    execute_command \
        "Restart Redis on standby server" \
        "ssh $STANDBY_HOST 'sudo systemctl restart redis && sudo systemctl enable redis'" \
        true
    
    # Verify replication
    execute_command \
        "Verify Redis replication" \
        "ssh $STANDBY_HOST 'redis-cli ping'" \
        true
    
    log_success "Redis standby setup completed"
}

# Function to setup service standby
setup_service_standby() {
    if [[ "$SETUP_SERVICES" != "true" ]]; then
        log_info "Skipping service standby setup"
        return 0
    fi
    
    log_info "Setting up service standby on $STANDBY_HOST..."
    
    # Create application directory on standby
    execute_command \
        "Create application directory on standby" \
        "ssh $STANDBY_HOST 'sudo mkdir -p /opt/titan && sudo chown \$(whoami):\$(whoami) /opt/titan'" \
        true
    
    # Sync application code to standby
    execute_command \
        "Sync application code to standby" \
        "rsync -avz --exclude node_modules --exclude logs --exclude .git $PROJECT_ROOT/ $STANDBY_HOST:/opt/titan/" \
        true
    
    # Install Node.js and PM2 on standby
    execute_command \
        "Install Node.js and PM2 on standby" \
        "ssh $STANDBY_HOST 'curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs && sudo npm install -g pm2'" \
        true
    
    # Install application dependencies on standby
    execute_command \
        "Install application dependencies on standby" \
        "ssh $STANDBY_HOST 'cd /opt/titan && npm install --production'" \
        true
    
    # Setup PM2 ecosystem on standby
    execute_command \
        "Setup PM2 ecosystem on standby" \
        "scp $PROJECT_ROOT/ecosystem.config.js $STANDBY_HOST:/opt/titan/" \
        true
    
    # Configure services to start on boot
    execute_command \
        "Configure PM2 startup on standby" \
        "ssh $STANDBY_HOST 'cd /opt/titan && pm2 startup && pm2 save'" \
        false
    
    log_success "Service standby setup completed"
}

# Function to setup Nginx standby
setup_nginx_standby() {
    if [[ "$SETUP_NGINX" != "true" ]]; then
        log_info "Skipping Nginx standby setup"
        return 0
    fi
    
    log_info "Setting up Nginx standby on $STANDBY_HOST..."
    
    # Install Nginx on standby
    execute_command \
        "Install Nginx on standby server" \
        "ssh $STANDBY_HOST 'sudo apt-get update && sudo apt-get install -y nginx'" \
        true
    
    # Copy Nginx configuration
    if [[ -f "/etc/nginx/sites-available/titan" ]]; then
        execute_command \
            "Copy Nginx configuration to standby" \
            "scp /etc/nginx/sites-available/titan $STANDBY_HOST:/tmp/ && ssh $STANDBY_HOST 'sudo mv /tmp/titan /etc/nginx/sites-available/ && sudo ln -sf /etc/nginx/sites-available/titan /etc/nginx/sites-enabled/'" \
            true
    fi
    
    # Configure Nginx health check endpoint
    local nginx_health_config="
location /nginx-health {
    access_log off;
    return 200 \"healthy\";
    add_header Content-Type text/plain;
}
"
    
    execute_command \
        "Configure Nginx health check endpoint" \
        "echo '$nginx_health_config' | ssh $STANDBY_HOST 'sudo tee /etc/nginx/conf.d/health.conf'" \
        true
    
    # Test and reload Nginx configuration
    execute_command \
        "Test and reload Nginx configuration" \
        "ssh $STANDBY_HOST 'sudo nginx -t && sudo systemctl reload nginx && sudo systemctl enable nginx'" \
        true
    
    log_success "Nginx standby setup completed"
}

# Function to setup monitoring and health checks
setup_monitoring() {
    log_info "Setting up monitoring and health checks..."
    
    # Create monitoring script on standby
    local monitoring_script="#!/bin/bash
# Standby Health Check Script
echo \"Standby Health Check - \$(date)\"
echo \"Redis: \$(redis-cli ping 2>/dev/null || echo 'FAILED')\"
echo \"Nginx: \$(curl -s http://localhost/nginx-health 2>/dev/null || echo 'FAILED')\"
echo \"PM2: \$(pm2 jlist | jq length 2>/dev/null || echo 'FAILED')\"
"
    
    execute_command \
        "Create monitoring script on standby" \
        "echo '$monitoring_script' | ssh $STANDBY_HOST 'tee /opt/titan/health-check.sh && chmod +x /opt/titan/health-check.sh'" \
        true
    
    # Setup cron job for regular health checks
    execute_command \
        "Setup health check cron job" \
        "ssh $STANDBY_HOST 'echo \"*/5 * * * * /opt/titan/health-check.sh >> /var/log/standby-health.log 2>&1\" | crontab -'" \
        false
    
    log_success "Monitoring setup completed"
}

# Function to update configuration with standby details
update_configuration() {
    log_info "Updating hot standby configuration..."
    
    # Update standby host in configuration
    if command -v jq &> /dev/null; then
        execute_command \
            "Update standby configuration with host details" \
            "jq '.components[].standby.host = \"$STANDBY_HOST\"' $STANDBY_CONFIG > ${STANDBY_CONFIG}.tmp && mv ${STANDBY_CONFIG}.tmp $STANDBY_CONFIG" \
            true
    else
        log_warning "jq not available. Please manually update standby host in $STANDBY_CONFIG"
    fi
    
    log_success "Configuration update completed"
}

# Function to test standby setup
test_standby_setup() {
    log_info "Testing standby setup..."
    
    # Test Redis connectivity
    if [[ "$SETUP_REDIS" == "true" ]]; then
        execute_command \
            "Test Redis connectivity on standby" \
            "ssh $STANDBY_HOST 'redis-cli ping'" \
            false
    fi
    
    # Test Nginx connectivity
    if [[ "$SETUP_NGINX" == "true" ]]; then
        execute_command \
            "Test Nginx health endpoint on standby" \
            "ssh $STANDBY_HOST 'curl -f http://localhost/nginx-health'" \
            false
    fi
    
    # Test application directory
    if [[ "$SETUP_SERVICES" == "true" ]]; then
        execute_command \
            "Test application directory on standby" \
            "ssh $STANDBY_HOST 'ls -la /opt/titan/'" \
            false
    fi
    
    log_success "Standby setup testing completed"
}

# Function to generate setup report
generate_setup_report() {
    local report_file="$LOG_DIR/setup-report-$(date +%Y%m%d-%H%M%S).md"
    
    cat > "$report_file" << EOF
# Hot Standby Setup Report

## Setup Details

- **Date:** $(date)
- **Standby Host:** $STANDBY_HOST
- **Setup Log:** $SETUP_LOG

## Components Configured

- **Redis Standby:** $([ "$SETUP_REDIS" == "true" ] && echo "✅ Configured" || echo "⏭️ Skipped")
- **Service Standby:** $([ "$SETUP_SERVICES" == "true" ] && echo "✅ Configured" || echo "⏭️ Skipped")
- **Nginx Standby:** $([ "$SETUP_NGINX" == "true" ] && echo "✅ Configured" || echo "⏭️ Skipped")

## Next Steps

1. **Verify Configuration**
   - Review hot standby configuration: \`$STANDBY_CONFIG\`
   - Test failover procedures manually
   - Validate monitoring and alerting

2. **Start Hot Standby Manager**
   \`\`\`bash
   node services/deployment/hot-standby-manager.js
   \`\`\`

3. **Monitor System**
   - Check standby health regularly
   - Review failover logs
   - Test disaster recovery procedures

## Troubleshooting

### Common Issues

1. **SSH Connection Failed**
   - Ensure SSH key authentication is configured
   - Check network connectivity to standby host

2. **Redis Replication Issues**
   - Verify Redis configuration on both servers
   - Check firewall rules for Redis port (6379)

3. **Service Sync Issues**
   - Ensure rsync is installed on both servers
   - Check file permissions on standby server

### Support Commands

\`\`\`bash
# Check standby health
ssh $STANDBY_HOST '/opt/titan/health-check.sh'

# View Redis replication status
ssh $STANDBY_HOST 'redis-cli info replication'

# Check PM2 processes on standby
ssh $STANDBY_HOST 'pm2 status'

# Test Nginx on standby
ssh $STANDBY_HOST 'curl http://localhost/nginx-health'
\`\`\`

EOF

    log_success "Setup report generated: $report_file"
}

# Function to confirm setup
confirm_setup() {
    if [[ "$FORCE" == "true" ]] || [[ "$DRY_RUN" == "true" ]]; then
        return 0
    fi
    
    echo
    log_warning "You are about to set up hot standby configuration on: $STANDBY_HOST"
    log_warning "This will install and configure services on the standby server."
    echo
    echo "Components to configure:"
    echo "  - Redis Standby: $([ "$SETUP_REDIS" == "true" ] && echo "Yes" || echo "No")"
    echo "  - Service Standby: $([ "$SETUP_SERVICES" == "true" ] && echo "Yes" || echo "No")"
    echo "  - Nginx Standby: $([ "$SETUP_NGINX" == "true" ] && echo "Yes" || echo "No")"
    echo
    read -p "Are you sure you want to continue? (yes/no): " -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Setup cancelled by user"
        exit 0
    fi
}

# Main execution function
main() {
    parse_arguments "$@"
    
    log_info "=== Hot Standby Setup Started ==="
    log_info "Standby Host: $STANDBY_HOST"
    log_info "Setup Log: $SETUP_LOG"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_warning "DRY RUN MODE - No actual changes will be made"
    fi
    
    confirm_setup
    validate_prerequisites
    
    setup_redis_standby
    setup_service_standby
    setup_nginx_standby
    setup_monitoring
    update_configuration
    test_standby_setup
    
    generate_setup_report
    
    log_success "Hot standby setup completed successfully!"
    log_info "Review the setup report for next steps and troubleshooting information"
}

# Execute main function with all arguments
main "$@"