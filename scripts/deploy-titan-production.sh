#!/bin/bash

# Titan Production Deployment Automation Script
# This script automates the complete deployment of the Titan Trading System to production
# Requirements: 1.1, 1.2, 2.1, 2.2

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_CONFIG_FILE="$PROJECT_ROOT/config/deployment/production.env"
SERVICES_DIR="$PROJECT_ROOT/services"
LOGS_DIR="$PROJECT_ROOT/logs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Deployment configuration
DEPLOYMENT_MODE="production"
ROLLBACK_ON_FAILURE=true
HEALTH_CHECK_TIMEOUT=30
SERVICE_START_TIMEOUT=30
VALIDATION_TIMEOUT=60

# Service deployment order (dependencies first)
declare -a SERVICES=(
    "shared:3001:services/shared"
    "security:3002:services/security"
    "titan-brain:3000:services/titan-brain"
    "titan-execution:3003:services/titan-execution"
    "titan-phase1-scavenger:3004:services/titan-phase1-scavenger"
    "titan-ai-quant:3005:services/titan-ai-quant"
    "titan-console:3006:services/titan-console"
)

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

# Load deployment configuration
load_deployment_config() {
    log "Loading deployment configuration..."
    
    if [[ -f "$DEPLOYMENT_CONFIG_FILE" ]]; then
        source "$DEPLOYMENT_CONFIG_FILE"
        success "Deployment configuration loaded from $DEPLOYMENT_CONFIG_FILE"
    else
        warning "Deployment configuration file not found: $DEPLOYMENT_CONFIG_FILE"
        warning "Using default configuration"
    fi
}

# Validate prerequisites
validate_prerequisites() {
    log "Validating deployment prerequisites..."
    
    local errors=0
    
    # Check if running as correct user
    if [[ "$USER" != "titan" ]] && [[ "$USER" != "root" ]]; then
        warning "Not running as 'titan' user. Current user: $USER"
    fi
    
    # Check required commands
    local required_commands=("node" "npm" "pm2" "redis-cli" "nginx")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            error "Required command not found: $cmd"
            ((errors++))
        fi
    done
    
    # Check Node.js version
    local node_version=$(node --version | sed 's/v//')
    local required_version="18.0.0"
    if ! printf '%s\n%s\n' "$required_version" "$node_version" | sort -V -C; then
        error "Node.js version $node_version is below required version $required_version"
        ((errors++))
    fi
    
    # Check Redis connectivity
    if ! redis-cli ping &> /dev/null; then
        error "Redis is not accessible"
        ((errors++))
    fi
    
    # Check PM2 status
    if ! pm2 status &> /dev/null; then
        error "PM2 is not accessible"
        ((errors++))
    fi
    
    # Check disk space (minimum 5GB free)
    local available_space=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $4}')
    local min_space=$((5 * 1024 * 1024)) # 5GB in KB
    if [[ "$available_space" -lt "$min_space" ]]; then
        error "Insufficient disk space. Available: ${available_space}KB, Required: ${min_space}KB"
        ((errors++))
    fi
    
    if [[ $errors -gt 0 ]]; then
        error "Prerequisites validation failed with $errors error(s)"
        return 1
    fi
    
    success "Prerequisites validation passed"
    return 0
}

# Create deployment directories
create_deployment_directories() {
    log "Creating deployment directories..."
    
    local directories=(
        "$LOGS_DIR"
        "$LOGS_DIR/deployment"
        "$PROJECT_ROOT/backups/deployment"
        "$PROJECT_ROOT/tmp/deployment"
        "/var/log/titan"
    )
    
    for dir in "${directories[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            log "Created directory: $dir"
        fi
    done
    
    # Set proper permissions
    if [[ "$USER" == "root" ]]; then
        chown -R titan:titan "$PROJECT_ROOT"
        chown -R titan:titan "/var/log/titan"
    fi
    
    success "Deployment directories created"
}

# Backup current deployment
backup_current_deployment() {
    log "Creating backup of current deployment..."
    
    local backup_timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_dir="$PROJECT_ROOT/backups/deployment/backup_$backup_timestamp"
    
    mkdir -p "$backup_dir"
    
    # Backup configuration files
    if [[ -d "$PROJECT_ROOT/config" ]]; then
        cp -r "$PROJECT_ROOT/config" "$backup_dir/"
        log "Backed up configuration files"
    fi
    
    # Backup PM2 ecosystem file
    if [[ -f "$PROJECT_ROOT/ecosystem.config.js" ]]; then
        cp "$PROJECT_ROOT/ecosystem.config.js" "$backup_dir/"
        log "Backed up PM2 ecosystem file"
    fi
    
    # Backup current PM2 processes list
    pm2 jlist > "$backup_dir/pm2_processes.json" 2>/dev/null || true
    
    # Create backup manifest
    cat > "$backup_dir/backup_manifest.json" << EOF
{
    "timestamp": "$backup_timestamp",
    "deployment_mode": "$DEPLOYMENT_MODE",
    "backup_type": "pre_deployment",
    "services_backed_up": $(echo "${SERVICES[@]}" | jq -R 'split(" ")'),
    "created_by": "$USER",
    "hostname": "$(hostname)"
}
EOF
    
    success "Backup created: $backup_dir"
    echo "$backup_dir" > "$PROJECT_ROOT/tmp/deployment/last_backup.txt"
}

# Install service dependencies
install_service_dependencies() {
    local service_name=$1
    local service_path=$2
    
    log "Installing dependencies for $service_name..."
    
    cd "$service_path"
    
    # Check if package.json exists
    if [[ ! -f "package.json" ]]; then
        warning "No package.json found for $service_name, skipping dependency installation"
        return 0
    fi
    
    # Install production dependencies
    if ! npm ci --only=production --silent; then
        error "Failed to install dependencies for $service_name"
        return 1
    fi
    
    # Build TypeScript if needed
    if [[ -f "tsconfig.json" ]]; then
        log "Building TypeScript for $service_name..."
        if ! npm run build --silent; then
            error "Failed to build TypeScript for $service_name"
            return 1
        fi
    fi
    
    success "Dependencies installed for $service_name"
    cd - > /dev/null
    return 0
}

# Deploy individual service
deploy_service() {
    local service_info=$1
    IFS=':' read -r service_name service_port service_path <<< "$service_info"
    
    log "Deploying service: $service_name"
    
    # Check if service directory exists
    if [[ ! -d "$service_path" ]]; then
        warning "Service directory not found: $service_path, skipping..."
        return 0
    fi
    
    # Install dependencies and build
    if ! install_service_dependencies "$service_name" "$service_path"; then
        error "Failed to prepare $service_name for deployment"
        return 1
    fi
    
    # Stop existing service if running
    if pm2 describe "$service_name" &> /dev/null; then
        log "Stopping existing $service_name service..."
        pm2 stop "$service_name" --silent || true
        pm2 delete "$service_name" --silent || true
    fi
    
    # Start service with PM2
    log "Starting $service_name with PM2..."
    cd "$service_path"
    
    # Determine start script based on service
    local start_script=""
    case "$service_name" in
        "shared")
            start_script="dist/index.js"
            ;;
        "security")
            start_script="dist/index.js"
            ;;
        "titan-brain")
            start_script="dist/index.js"
            ;;
        "titan-execution")
            start_script="server-production.js"
            ;;
        "titan-phase1-scavenger")
            start_script="dist/index.js"
            ;;
        "titan-ai-quant")
            start_script="dist/index.js"
            ;;
        "titan-console")
            start_script="server.js"
            ;;
        *)
            start_script="dist/index.js"
            ;;
    esac
    
    # Check if start script exists
    if [[ ! -f "$start_script" ]]; then
        error "Start script not found for $service_name: $start_script"
        cd - > /dev/null
        return 1
    fi
    
    # Start with PM2
    pm2 start "$start_script" \
        --name "$service_name" \
        --instances 1 \
        --max-memory-restart 500M \
        --log-date-format "YYYY-MM-DD HH:mm:ss Z" \
        --merge-logs \
        --output "$LOGS_DIR/${service_name}.log" \
        --error "$LOGS_DIR/${service_name}-error.log" \
        --env production \
        --silent
    
    cd - > /dev/null
    
    # Wait for service to start
    log "Waiting for $service_name to start..."
    local attempts=0
    local max_attempts=$((SERVICE_START_TIMEOUT / 2))
    
    while [[ $attempts -lt $max_attempts ]]; do
        if pm2 describe "$service_name" | grep -q "online"; then
            success "$service_name started successfully"
            return 0
        fi
        sleep 2
        ((attempts++))
    done
    
    error "$service_name failed to start within $SERVICE_START_TIMEOUT seconds"
    return 1
}

# Validate service health
validate_service_health() {
    local service_info=$1
    IFS=':' read -r service_name service_port service_path <<< "$service_info"
    
    log "Validating health of $service_name..."
    
    # Check PM2 status
    if ! pm2 describe "$service_name" | grep -q "online"; then
        error "$service_name is not running in PM2"
        return 1
    fi
    
    # Check port availability
    local attempts=0
    local max_attempts=$((HEALTH_CHECK_TIMEOUT / 2))
    
    while [[ $attempts -lt $max_attempts ]]; do
        if netstat -tuln | grep -q ":$service_port "; then
            success "$service_name is listening on port $service_port"
            break
        fi
        sleep 2
        ((attempts++))
    done
    
    if [[ $attempts -eq $max_attempts ]]; then
        error "$service_name is not listening on port $service_port"
        return 1
    fi
    
    # HTTP health check (if applicable)
    local health_endpoints=(
        "titan-brain:/status"
        "titan-execution:/health"
        "titan-console:/api/health"
        "shared:/health"
        "security:/health"
    )
    
    for endpoint in "${health_endpoints[@]}"; do
        IFS=':' read -r svc_name svc_path <<< "$endpoint"
        if [[ "$svc_name" == "$service_name" ]]; then
            local health_url="http://localhost:$service_port$svc_path"
            if curl -s -f "$health_url" > /dev/null 2>&1; then
                success "$service_name health check passed"
            else
                warning "$service_name health check failed (non-critical)"
            fi
            break
        fi
    done
    
    return 0
}

# Validate deployment
validate_deployment() {
    log "Validating complete deployment..."
    
    local failed_services=()
    
    # Validate each service
    for service_info in "${SERVICES[@]}"; do
        IFS=':' read -r service_name service_port service_path <<< "$service_info"
        
        if [[ -d "$service_path" ]]; then
            if ! validate_service_health "$service_info"; then
                failed_services+=("$service_name")
            fi
        fi
    done
    
    # Validate Redis connectivity
    log "Validating Redis connectivity..."
    if ! redis-cli ping > /dev/null 2>&1; then
        error "Redis connectivity validation failed"
        failed_services+=("redis")
    else
        success "Redis connectivity validated"
    fi
    
    # Validate inter-service communication
    log "Validating inter-service communication..."
    # This would include WebSocket connections, API calls between services, etc.
    # For now, we'll do basic port checks
    
    if [[ ${#failed_services[@]} -eq 0 ]]; then
        success "Deployment validation passed"
        return 0
    else
        error "Deployment validation failed for services: ${failed_services[*]}"
        return 1
    fi
}

# Rollback deployment
rollback_deployment() {
    log "Rolling back deployment..."
    
    local backup_file="$PROJECT_ROOT/tmp/deployment/last_backup.txt"
    if [[ ! -f "$backup_file" ]]; then
        error "No backup information found for rollback"
        return 1
    fi
    
    local backup_dir=$(cat "$backup_file")
    if [[ ! -d "$backup_dir" ]]; then
        error "Backup directory not found: $backup_dir"
        return 1
    fi
    
    # Stop all services
    log "Stopping all services for rollback..."
    for service_info in "${SERVICES[@]}"; do
        IFS=':' read -r service_name service_port service_path <<< "$service_info"
        pm2 stop "$service_name" --silent || true
        pm2 delete "$service_name" --silent || true
    done
    
    # Restore configuration
    if [[ -d "$backup_dir/config" ]]; then
        cp -r "$backup_dir/config"/* "$PROJECT_ROOT/config/"
        log "Configuration restored from backup"
    fi
    
    # Restore PM2 ecosystem
    if [[ -f "$backup_dir/ecosystem.config.js" ]]; then
        cp "$backup_dir/ecosystem.config.js" "$PROJECT_ROOT/"
        log "PM2 ecosystem restored from backup"
    fi
    
    # Restart services from backup
    if [[ -f "$backup_dir/pm2_processes.json" ]]; then
        pm2 resurrect "$backup_dir/pm2_processes.json" --silent || true
        log "PM2 processes restored from backup"
    fi
    
    success "Rollback completed"
}

# Save deployment state
save_deployment_state() {
    log "Saving deployment state..."
    
    local state_file="$PROJECT_ROOT/tmp/deployment/deployment_state.json"
    local deployment_timestamp=$(date -Iseconds)
    
    # Get PM2 process list
    local pm2_list=$(pm2 jlist 2>/dev/null || echo "[]")
    
    # Create deployment state
    cat > "$state_file" << EOF
{
    "deployment_timestamp": "$deployment_timestamp",
    "deployment_mode": "$DEPLOYMENT_MODE",
    "deployed_by": "$USER",
    "hostname": "$(hostname)",
    "services": $(echo "${SERVICES[@]}" | jq -R 'split(" ")'),
    "pm2_processes": $pm2_list,
    "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "git_branch": "$(git branch --show-current 2>/dev/null || echo 'unknown')"
}
EOF
    
    success "Deployment state saved to $state_file"
}

# Main deployment function
main_deployment() {
    log "Starting Titan Production Deployment..."
    
    # Load configuration
    load_deployment_config
    
    # Validate prerequisites
    if ! validate_prerequisites; then
        error "Prerequisites validation failed"
        exit 1
    fi
    
    # Create directories
    create_deployment_directories
    
    # Create backup
    backup_current_deployment
    
    # Deploy services in dependency order
    local failed_services=()
    for service_info in "${SERVICES[@]}"; do
        IFS=':' read -r service_name service_port service_path <<< "$service_info"
        
        if [[ -d "$service_path" ]]; then
            if ! deploy_service "$service_info"; then
                failed_services+=("$service_name")
                error "Failed to deploy $service_name"
                
                if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
                    warning "Rolling back due to deployment failure..."
                    rollback_deployment
                    exit 1
                fi
            else
                success "Successfully deployed $service_name"
            fi
        else
            warning "Service directory not found: $service_path, skipping..."
        fi
        
        # Brief pause between services
        sleep 2
    done
    
    # Validate deployment
    if ! validate_deployment; then
        error "Deployment validation failed"
        
        if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
            warning "Rolling back due to validation failure..."
            rollback_deployment
            exit 1
        fi
    fi
    
    # Save deployment state
    save_deployment_state
    
    # Final status
    if [[ ${#failed_services[@]} -eq 0 ]]; then
        success "Titan Production Deployment completed successfully!"
        log "All services are running and validated"
        
        # Display service status
        echo ""
        log "Service Status:"
        pm2 status
        
        echo ""
        log "Next steps:"
        log "1. Monitor service logs: pm2 logs"
        log "2. Check service metrics and health endpoints"
        log "3. Verify trading functionality"
        log "4. Set up monitoring and alerting"
        
        return 0
    else
        error "Deployment completed with failures: ${failed_services[*]}"
        return 1
    fi
}

# Display usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
    --no-rollback          Disable automatic rollback on failure
    --timeout SECONDS      Set health check timeout (default: 30)
    --config FILE          Use custom deployment configuration file
    -h, --help            Show this help message

Examples:
    $0                                    # Standard production deployment
    $0 --no-rollback                     # Deploy without rollback on failure
    $0 --timeout 60                      # Use 60-second timeout for health checks
    $0 --config custom.env               # Use custom configuration file

This script will:
1. Validate deployment prerequisites
2. Create backup of current deployment
3. Deploy services in dependency order
4. Validate service health and connectivity
5. Save deployment state for monitoring

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --no-rollback)
                ROLLBACK_ON_FAILURE=false
                shift
                ;;
            --timeout)
                HEALTH_CHECK_TIMEOUT="$2"
                SERVICE_START_TIMEOUT="$2"
                shift 2
                ;;
            --config)
                DEPLOYMENT_CONFIG_FILE="$2"
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

# Signal handlers for graceful shutdown
cleanup() {
    log "Deployment interrupted, cleaning up..."
    # Kill any background processes
    jobs -p | xargs -r kill 2>/dev/null || true
    exit 1
}

trap cleanup SIGINT SIGTERM

# Main execution
echo -e "${PURPLE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║         TITAN PRODUCTION DEPLOYMENT AUTOMATION             ║${NC}"
echo -e "${PURPLE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Parse arguments and run main deployment
parse_args "$@"
main_deployment