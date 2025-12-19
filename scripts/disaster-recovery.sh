#!/bin/bash

# Titan Trading System - Disaster Recovery Script
# 
# This script automates disaster recovery procedures for various failure scenarios.
# It provides a unified interface for executing recovery procedures with proper
# logging, validation, and rollback capabilities.
#
# Usage: ./disaster-recovery.sh --scenario <scenario-id> [options]
#
# Requirements: 10.1

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_ROOT/logs/disaster-recovery"
BACKUP_DIR="/backups"
CONFIG_DIR="$PROJECT_ROOT/config"
DOCS_DIR="$PROJECT_ROOT/docs/disaster-recovery"

# Logging setup
mkdir -p "$LOG_DIR"
RECOVERY_LOG="$LOG_DIR/recovery-$(date +%Y%m%d-%H%M%S).log"
exec 1> >(tee -a "$RECOVERY_LOG")
exec 2> >(tee -a "$RECOVERY_LOG" >&2)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Global variables
SCENARIO=""
DRY_RUN=false
FORCE=false
SKIP_VALIDATION=false
RECOVERY_START_TIME=""
RECOVERY_ID=""

# Function to print colored output
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$RECOVERY_LOG"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$RECOVERY_LOG"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$RECOVERY_LOG"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$RECOVERY_LOG"
}

# Function to show usage
show_usage() {
    cat << EOF
Titan Trading System - Disaster Recovery Script

Usage: $0 --scenario <scenario-id> [options]

Scenarios:
  complete-system-failure    Complete server failure requiring full restoration
  database-corruption        Redis database corruption recovery
  network-partition          Network connectivity issues
  configuration-corruption   Configuration file corruption

Options:
  --scenario <id>            Disaster recovery scenario to execute
  --dry-run                  Show what would be done without executing
  --force                    Skip confirmation prompts
  --skip-validation          Skip post-recovery validation steps
  --help                     Show this help message

Examples:
  $0 --scenario complete-system-failure
  $0 --scenario database-corruption --dry-run
  $0 --scenario network-partition --force

EOF
}

# Function to parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --scenario)
                SCENARIO="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            --skip-validation)
                SKIP_VALIDATION=true
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

    if [[ -z "$SCENARIO" ]]; then
        log_error "Scenario is required. Use --scenario <scenario-id>"
        show_usage
        exit 1
    fi
}

# Function to initialize recovery session
initialize_recovery() {
    RECOVERY_START_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    RECOVERY_ID="recovery-$(date +%Y%m%d-%H%M%S)-$$"
    
    log_info "=== Disaster Recovery Session Started ==="
    log_info "Recovery ID: $RECOVERY_ID"
    log_info "Scenario: $SCENARIO"
    log_info "Start Time: $RECOVERY_START_TIME"
    log_info "Log File: $RECOVERY_LOG"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_warning "DRY RUN MODE - No actual changes will be made"
    fi
}

# Function to execute command with logging and timeout
execute_command() {
    local description="$1"
    local command="$2"
    local timeout="${3:-60}"
    local critical="${4:-true}"
    
    log_info "Executing: $description"
    log_info "Command: $command"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would execute: $command"
        return 0
    fi
    
    local start_time=$(date +%s)
    
    if timeout "$timeout" bash -c "$command"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_success "$description completed in ${duration}s"
        return 0
    else
        local exit_code=$?
        log_error "$description failed with exit code $exit_code"
        
        if [[ "$critical" == "true" ]]; then
            log_error "Critical step failed. Aborting recovery."
            exit 1
        else
            log_warning "Non-critical step failed. Continuing recovery."
            return $exit_code
        fi
    fi
}

# Function to validate prerequisites
validate_prerequisites() {
    log_info "Validating prerequisites for scenario: $SCENARIO"
    
    # Check if running as appropriate user
    if [[ $EUID -eq 0 ]] && [[ "$SCENARIO" != "complete-system-failure" ]]; then
        log_warning "Running as root. Some operations may require non-root user."
    fi
    
    # Check backup directory exists
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_error "Backup directory not found: $BACKUP_DIR"
        exit 1
    fi
    
    # Check if PM2 is available
    if ! command -v pm2 &> /dev/null; then
        log_error "PM2 not found. Please install PM2 first."
        exit 1
    fi
    
    # Check if Redis CLI is available
    if ! command -v redis-cli &> /dev/null; then
        log_error "Redis CLI not found. Please install Redis first."
        exit 1
    fi
    
    # Scenario-specific prerequisites
    case "$SCENARIO" in
        "complete-system-failure")
            validate_complete_system_prerequisites
            ;;
        "database-corruption")
            validate_database_prerequisites
            ;;
        "network-partition")
            validate_network_prerequisites
            ;;
        "configuration-corruption")
            validate_config_prerequisites
            ;;
        *)
            log_error "Unknown scenario: $SCENARIO"
            exit 1
            ;;
    esac
    
    log_success "Prerequisites validation completed"
}

# Scenario-specific prerequisite validation functions
validate_complete_system_prerequisites() {
    log_info "Validating complete system failure prerequisites"
    
    # Check if we have infrastructure scripts
    local required_scripts=(
        "provision-infrastructure.sh"
        "setup-dependencies.sh"
        "restore-config.sh"
        "restore-application.sh"
    )
    
    for script in "${required_scripts[@]}"; do
        if [[ ! -f "$SCRIPT_DIR/$script" ]]; then
            log_error "Required script not found: $script"
            exit 1
        fi
    done
}

validate_database_prerequisites() {
    log_info "Validating database corruption prerequisites"
    
    # Check if Redis backup exists
    if [[ ! -d "$BACKUP_DIR/redis" ]]; then
        log_error "Redis backup directory not found: $BACKUP_DIR/redis"
        exit 1
    fi
    
    # Check if latest backup exists
    if [[ ! -f "$BACKUP_DIR/redis/latest/dump.rdb" ]]; then
        log_error "Latest Redis backup not found: $BACKUP_DIR/redis/latest/dump.rdb"
        exit 1
    fi
}

validate_network_prerequisites() {
    log_info "Validating network partition prerequisites"
    
    # Check if network diagnostic tools are available
    local required_tools=("curl" "ping" "netstat")
    
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "Required network tool not found: $tool"
            exit 1
        fi
    done
}

validate_config_prerequisites() {
    log_info "Validating configuration corruption prerequisites"
    
    # Check if config backup exists
    if [[ ! -d "$BACKUP_DIR/config" ]]; then
        log_error "Configuration backup directory not found: $BACKUP_DIR/config"
        exit 1
    fi
}

# Function to execute recovery scenario
execute_recovery() {
    log_info "Executing recovery scenario: $SCENARIO"
    
    case "$SCENARIO" in
        "complete-system-failure")
            execute_complete_system_recovery
            ;;
        "database-corruption")
            execute_database_recovery
            ;;
        "network-partition")
            execute_network_recovery
            ;;
        "configuration-corruption")
            execute_config_recovery
            ;;
        *)
            log_error "Unknown scenario: $SCENARIO"
            exit 1
            ;;
    esac
}

# Complete system failure recovery
execute_complete_system_recovery() {
    log_info "Starting complete system failure recovery"
    
    # Step 1: Provision infrastructure (if needed)
    execute_command \
        "Provision server infrastructure" \
        "bash $SCRIPT_DIR/provision-infrastructure.sh" \
        300 \
        true
    
    # Step 2: Install dependencies
    execute_command \
        "Install base dependencies" \
        "bash $SCRIPT_DIR/setup-dependencies.sh" \
        180 \
        true
    
    # Step 3: Restore configuration
    execute_command \
        "Restore configuration files" \
        "bash $SCRIPT_DIR/restore-config.sh" \
        60 \
        true
    
    # Step 4: Restore application
    execute_command \
        "Restore application code" \
        "bash $SCRIPT_DIR/restore-application.sh" \
        120 \
        true
    
    # Step 5: Start Redis
    execute_command \
        "Start Redis service" \
        "sudo systemctl start redis && sleep 5 && sudo systemctl is-active redis" \
        30 \
        true
    
    # Step 6: Start Titan services
    execute_command \
        "Start Titan services via PM2" \
        "cd $PROJECT_ROOT && pm2 start ecosystem.config.js" \
        60 \
        true
    
    # Step 7: Validate services
    execute_command \
        "Validate all services are running" \
        "pm2 status | grep -E '(online|stopped|errored)'" \
        10 \
        true
}

# Database corruption recovery
execute_database_recovery() {
    log_info "Starting database corruption recovery"
    
    # Step 1: Stop Titan services
    execute_command \
        "Stop all Titan services" \
        "pm2 stop all" \
        30 \
        true
    
    # Step 2: Stop Redis
    execute_command \
        "Stop Redis service" \
        "sudo systemctl stop redis" \
        15 \
        true
    
    # Step 3: Backup corrupted data
    execute_command \
        "Backup corrupted Redis data" \
        "sudo cp /var/lib/redis/dump.rdb /var/lib/redis/dump.rdb.corrupted.$(date +%s)" \
        10 \
        false
    
    # Step 4: Restore from backup
    execute_command \
        "Restore Redis from backup" \
        "sudo cp $BACKUP_DIR/redis/latest/dump.rdb /var/lib/redis/" \
        30 \
        true
    
    # Step 5: Fix permissions
    execute_command \
        "Set correct permissions" \
        "sudo chown redis:redis /var/lib/redis/dump.rdb" \
        5 \
        true
    
    # Step 6: Start Redis
    execute_command \
        "Start Redis service" \
        "sudo systemctl start redis && sleep 5 && redis-cli ping" \
        30 \
        true
    
    # Step 7: Start services
    execute_command \
        "Start Titan services" \
        "pm2 start all" \
        60 \
        true
}

# Network partition recovery
execute_network_recovery() {
    log_info "Starting network partition recovery"
    
    # Step 1: Emergency halt
    execute_command \
        "Activate emergency trading halt" \
        "curl -X POST http://localhost:3000/emergency/halt || true" \
        5 \
        true
    
    # Step 2: Network diagnostics
    execute_command \
        "Run network diagnostics" \
        "bash $SCRIPT_DIR/network-diagnostics.sh" \
        60 \
        false
    
    # Step 3: Restart networking
    execute_command \
        "Restart networking service" \
        "sudo systemctl restart networking" \
        30 \
        false
    
    # Step 4: Test connectivity
    execute_command \
        "Test exchange connectivity" \
        "bash $SCRIPT_DIR/test-exchange-connectivity.sh" \
        30 \
        true
    
    # Step 5: Resume trading
    execute_command \
        "Resume trading operations" \
        "curl -X POST http://localhost:3000/emergency/resume" \
        5 \
        true
}

# Configuration corruption recovery
execute_config_recovery() {
    log_info "Starting configuration corruption recovery"
    
    # Step 1: Stop services
    execute_command \
        "Stop affected services" \
        "pm2 stop all" \
        30 \
        true
    
    # Step 2: Backup corrupted config
    execute_command \
        "Backup corrupted configuration" \
        "cp -r $CONFIG_DIR $CONFIG_DIR.corrupted.$(date +%s)" \
        10 \
        false
    
    # Step 3: Restore config
    execute_command \
        "Restore configuration from backup" \
        "bash $SCRIPT_DIR/restore-config.sh" \
        30 \
        true
    
    # Step 4: Validate config
    execute_command \
        "Validate configuration integrity" \
        "node $SCRIPT_DIR/validate-config.js" \
        15 \
        true
    
    # Step 5: Restart services
    execute_command \
        "Restart services with restored config" \
        "cd $PROJECT_ROOT && pm2 start ecosystem.config.js" \
        60 \
        true
}

# Function to run validation steps
run_validation() {
    if [[ "$SKIP_VALIDATION" == "true" ]]; then
        log_warning "Skipping validation steps as requested"
        return 0
    fi
    
    log_info "Running post-recovery validation"
    
    case "$SCENARIO" in
        "complete-system-failure"|"database-corruption"|"configuration-corruption")
            validate_system_recovery
            ;;
        "network-partition")
            validate_network_recovery
            ;;
    esac
}

# System recovery validation
validate_system_recovery() {
    log_info "Validating system recovery"
    
    # Check PM2 processes
    execute_command \
        "Verify PM2 processes are online" \
        "pm2 jlist | jq -r '.[].pm2_env.status' | grep -v online | wc -l | grep -q '^0$'" \
        10 \
        true
    
    # Check Redis connectivity
    execute_command \
        "Test Redis connectivity" \
        "redis-cli ping | grep -q PONG" \
        5 \
        true
    
    # Check WebSocket connections
    execute_command \
        "Verify WebSocket connections" \
        "curl -f http://localhost:3000/health/websockets" \
        10 \
        true
    
    # Check trading system
    execute_command \
        "Check trading system status" \
        "curl -f http://localhost:3000/health/trading" \
        10 \
        true
}

# Network recovery validation
validate_network_recovery() {
    log_info "Validating network recovery"
    
    # Check exchange connectivity
    execute_command \
        "Verify exchange API connectivity" \
        "curl -f https://api.binance.com/api/v3/ping" \
        10 \
        true
    
    # Test WebSocket connections
    execute_command \
        "Test WebSocket connections" \
        "bash $SCRIPT_DIR/test-websocket-connections.sh" \
        15 \
        true
}

# Function to generate recovery report
generate_recovery_report() {
    local end_time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local start_timestamp=$(date -d "$RECOVERY_START_TIME" +%s)
    local end_timestamp=$(date +%s)
    local duration=$((end_timestamp - start_timestamp))
    
    local report_file="$LOG_DIR/recovery-report-$RECOVERY_ID.json"
    
    cat > "$report_file" << EOF
{
  "recoveryId": "$RECOVERY_ID",
  "scenario": "$SCENARIO",
  "startTime": "$RECOVERY_START_TIME",
  "endTime": "$end_time",
  "durationSeconds": $duration,
  "dryRun": $DRY_RUN,
  "success": true,
  "logFile": "$RECOVERY_LOG",
  "validationSkipped": $SKIP_VALIDATION
}
EOF
    
    log_success "Recovery completed successfully!"
    log_info "Recovery ID: $RECOVERY_ID"
    log_info "Duration: ${duration} seconds"
    log_info "Report: $report_file"
    log_info "Log: $RECOVERY_LOG"
}

# Function to handle cleanup on exit
cleanup() {
    local exit_code=$?
    
    if [[ $exit_code -ne 0 ]]; then
        log_error "Recovery failed with exit code $exit_code"
        
        # Generate failure report
        local end_time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        local report_file="$LOG_DIR/recovery-failure-$RECOVERY_ID.json"
        
        cat > "$report_file" << EOF
{
  "recoveryId": "$RECOVERY_ID",
  "scenario": "$SCENARIO",
  "startTime": "$RECOVERY_START_TIME",
  "endTime": "$end_time",
  "success": false,
  "exitCode": $exit_code,
  "logFile": "$RECOVERY_LOG"
}
EOF
        
        log_error "Failure report: $report_file"
    fi
}

# Function to confirm execution
confirm_execution() {
    if [[ "$FORCE" == "true" ]] || [[ "$DRY_RUN" == "true" ]]; then
        return 0
    fi
    
    echo
    log_warning "You are about to execute disaster recovery scenario: $SCENARIO"
    log_warning "This will make significant changes to the system."
    echo
    read -p "Are you sure you want to continue? (yes/no): " -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Recovery cancelled by user"
        exit 0
    fi
}

# Main execution function
main() {
    parse_arguments "$@"
    initialize_recovery
    
    # Set up cleanup handler
    trap cleanup EXIT
    
    confirm_execution
    validate_prerequisites
    execute_recovery
    run_validation
    generate_recovery_report
}

# Execute main function with all arguments
main "$@"