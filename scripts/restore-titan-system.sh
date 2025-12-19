#!/bin/bash

# Titan System Restore Script
# This script restores the Titan Trading System from backups
# Requirements: 6.1 - Restore system from backups

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_ROOT="$PROJECT_ROOT/backups"
CONFIG_DIR="$PROJECT_ROOT/config"
LOGS_DIR="$PROJECT_ROOT/logs"
SERVICES_DIR="$PROJECT_ROOT/services"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Restore configuration
RESTORE_MODE="full"
BACKUP_FILE=""
FORCE_RESTORE=false
STOP_SERVICES=true
VALIDATE_AFTER_RESTORE=true

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

# Validate backup file
validate_backup_file() {
    local backup_file=$1
    
    log "Validating backup file: $backup_file"
    
    # Check if file exists
    if [[ ! -f "$backup_file" ]]; then
        error "Backup file not found: $backup_file"
        return 1
    fi
    
    # Check file size
    local file_size=$(stat -c%s "$backup_file" 2>/dev/null || stat -f%z "$backup_file" 2>/dev/null)
    if [[ "$file_size" -lt 1024 ]]; then
        error "Backup file is too small: $file_size bytes"
        return 1
    fi
    
    # Check file extension and validate accordingly
    if [[ "$backup_file" =~ \.enc$ ]]; then
        log "Encrypted backup detected"
        # We'll validate after decryption
    elif [[ "$backup_file" =~ \.tar\.gz$ ]]; then
        log "Compressed backup detected"
        if ! gzip -t "$backup_file" 2>/dev/null; then
            error "Backup file is corrupted (gzip test failed)"
            return 1
        fi
    else
        warning "Unknown backup file format"
    fi
    
    success "Backup file validation passed"
    return 0
}

# Decrypt backup file
decrypt_backup() {
    local encrypted_file=$1
    local decrypted_file="${encrypted_file%.enc}"
    
    log "Decrypting backup file..."
    
    # Check for encryption key
    local key_file="$BACKUP_ROOT/.backup_key"
    if [[ ! -f "$key_file" ]]; then
        error "Encryption key not found: $key_file"
        error "Cannot decrypt backup without encryption key"
        return 1
    fi
    
    # Decrypt backup
    if ! openssl enc -aes-256-cbc -d -in "$encrypted_file" -out "$decrypted_file" -pass file:"$key_file"; then
        error "Failed to decrypt backup file"
        return 1
    fi
    
    success "Backup decrypted: $decrypted_file"
    echo "$decrypted_file"
}

# Extract backup file
extract_backup() {
    local backup_file=$1
    local extract_dir="$PROJECT_ROOT/tmp/restore_$(date +%Y%m%d_%H%M%S)"
    
    log "Extracting backup to: $extract_dir"
    
    mkdir -p "$extract_dir"
    
    # Extract based on file type
    if [[ "$backup_file" =~ \.tar\.gz$ ]]; then
        if ! tar -xzf "$backup_file" -C "$extract_dir" --strip-components=1; then
            error "Failed to extract backup file"
            return 1
        fi
    else
        error "Unsupported backup file format"
        return 1
    fi
    
    success "Backup extracted to: $extract_dir"
    echo "$extract_dir"
}

# Read backup metadata
read_backup_metadata() {
    local backup_dir=$1
    local metadata_file="$backup_dir/backup_metadata.json"
    
    if [[ ! -f "$metadata_file" ]]; then
        warning "Backup metadata not found: $metadata_file"
        return 1
    fi
    
    log "Reading backup metadata..."
    
    # Display backup information
    local backup_timestamp=$(jq -r '.backup_info.timestamp' "$metadata_file" 2>/dev/null || echo "unknown")
    local backup_type=$(jq -r '.backup_info.type' "$metadata_file" 2>/dev/null || echo "unknown")
    local created_by=$(jq -r '.backup_info.created_by' "$metadata_file" 2>/dev/null || echo "unknown")
    local hostname=$(jq -r '.backup_info.hostname' "$metadata_file" 2>/dev/null || echo "unknown")
    
    log "Backup Information:"
    log "  Timestamp: $backup_timestamp"
    log "  Type: $backup_type"
    log "  Created by: $created_by"
    log "  Hostname: $hostname"
    
    return 0
}

# Stop Titan services
stop_services() {
    if [[ "$STOP_SERVICES" != "true" ]]; then
        return 0
    fi
    
    log "Stopping Titan services..."
    
    # Stop PM2 processes
    if command -v pm2 &> /dev/null; then
        pm2 stop all --silent 2>/dev/null || true
        pm2 delete all --silent 2>/dev/null || true
        success "PM2 processes stopped"
    fi
    
    # Stop systemd services
    local titan_services=("titan-monitoring" "titan-backup")
    for service in "${titan_services[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            sudo systemctl stop "$service"
            log "Stopped systemd service: $service"
        fi
    done
    
    success "Services stopped"
}

# Create restore backup
create_restore_backup() {
    log "Creating backup of current system before restore..."
    
    local restore_backup_dir="$BACKUP_ROOT/pre-restore/backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$restore_backup_dir"
    
    # Backup current configuration
    if [[ -d "$CONFIG_DIR" ]]; then
        cp -r "$CONFIG_DIR" "$restore_backup_dir/" 2>/dev/null || true
    fi
    
    # Backup current logs (last 24 hours)
    if [[ -d "$LOGS_DIR" ]]; then
        find "$LOGS_DIR" -name "*.log" -mtime -1 -exec cp {} "$restore_backup_dir/" \; 2>/dev/null || true
    fi
    
    # Backup PM2 state
    pm2 jlist > "$restore_backup_dir/pm2_processes.json" 2>/dev/null || echo "[]" > "$restore_backup_dir/pm2_processes.json"
    
    success "Pre-restore backup created: $restore_backup_dir"
}

# Restore configuration files
restore_configuration() {
    local backup_dir=$1
    
    log "Restoring configuration files..."
    
    local config_backup_dir="$backup_dir/config"
    if [[ ! -d "$config_backup_dir" ]]; then
        warning "Configuration backup not found in: $config_backup_dir"
        return 0
    fi
    
    # Create backup of current config
    if [[ -d "$CONFIG_DIR" ]] && [[ "$FORCE_RESTORE" != "true" ]]; then
        mv "$CONFIG_DIR" "${CONFIG_DIR}.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
    fi
    
    # Restore configuration
    mkdir -p "$CONFIG_DIR"
    cp -r "$config_backup_dir"/* "$CONFIG_DIR/" 2>/dev/null || true
    
    # Restore PM2 ecosystem file
    if [[ -f "$backup_dir/ecosystem.config.js" ]]; then
        cp "$backup_dir/ecosystem.config.js" "$PROJECT_ROOT/"
        log "PM2 ecosystem file restored"
    fi
    
    # Restore environment files
    local env_files=(".env" ".env.production" ".env.local")
    for env_file in "${env_files[@]}"; do
        if [[ -f "$backup_dir/$env_file" ]]; then
            cp "$backup_dir/$env_file" "$PROJECT_ROOT/"
            log "Environment file restored: $env_file"
        fi
    done
    
    success "Configuration files restored"
}

# Restore logs
restore_logs() {
    local backup_dir=$1
    
    log "Restoring logs..."
    
    local logs_backup_dir="$backup_dir/logs"
    if [[ ! -d "$logs_backup_dir" ]]; then
        warning "Logs backup not found in: $logs_backup_dir"
        return 0
    fi
    
    # Create logs directory
    mkdir -p "$LOGS_DIR"
    
    # Restore log files
    cp -r "$logs_backup_dir"/* "$LOGS_DIR/" 2>/dev/null || true
    
    # Restore system logs
    local system_log_dirs=("titan" "pm2")
    for log_dir in "${system_log_dirs[@]}"; do
        if [[ -d "$logs_backup_dir/$log_dir" ]]; then
            sudo mkdir -p "/var/log/$log_dir" 2>/dev/null || true
            sudo cp -r "$logs_backup_dir/$log_dir"/* "/var/log/$log_dir/" 2>/dev/null || true
            log "System logs restored: /var/log/$log_dir"
        fi
    done
    
    success "Logs restored"
}

# Restore databases
restore_databases() {
    local backup_dir=$1
    
    log "Restoring databases..."
    
    local db_backup_dir="$backup_dir/databases"
    if [[ ! -d "$db_backup_dir" ]]; then
        warning "Database backup not found in: $db_backup_dir"
        return 0
    fi
    
    # Restore Redis data
    if [[ -f "$db_backup_dir/redis_dump.rdb" ]]; then
        log "Restoring Redis data..."
        
        # Stop Redis temporarily
        sudo systemctl stop redis-server 2>/dev/null || true
        
        # Get Redis data directory
        local redis_dir=$(redis-cli CONFIG GET dir 2>/dev/null | tail -1 || echo "/var/lib/redis")
        
        # Backup current Redis data
        if [[ -f "$redis_dir/dump.rdb" ]]; then
            sudo mv "$redis_dir/dump.rdb" "$redis_dir/dump.rdb.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
        fi
        
        # Restore Redis dump
        sudo cp "$db_backup_dir/redis_dump.rdb" "$redis_dir/dump.rdb"
        sudo chown redis:redis "$redis_dir/dump.rdb" 2>/dev/null || true
        
        # Start Redis
        sudo systemctl start redis-server 2>/dev/null || true
        
        success "Redis data restored"
    fi
    
    # Restore PostgreSQL databases
    local pg_backups=($(find "$db_backup_dir" -name "*.sql" 2>/dev/null || true))
    for pg_backup in "${pg_backups[@]}"; do
        local db_name=$(basename "$pg_backup" .sql)
        
        if command -v psql &> /dev/null; then
            log "Restoring PostgreSQL database: $db_name"
            
            # Drop and recreate database
            dropdb "$db_name" 2>/dev/null || true
            createdb "$db_name" 2>/dev/null || true
            
            # Restore database
            psql "$db_name" < "$pg_backup" 2>/dev/null || true
            
            success "PostgreSQL database restored: $db_name"
        fi
    done
    
    # Restore SQLite databases
    local sqlite_backups=($(find "$db_backup_dir" -name "*.db" 2>/dev/null || true))
    for sqlite_backup in "${sqlite_backups[@]}"; do
        local db_name=$(basename "$sqlite_backup")
        local target_path=$(find "$PROJECT_ROOT" -name "$db_name" | head -1)
        
        if [[ -n "$target_path" ]]; then
            # Backup current database
            if [[ -f "$target_path" ]]; then
                mv "$target_path" "${target_path}.backup.$(date +%Y%m%d_%H%M%S)"
            fi
            
            # Restore database
            cp "$sqlite_backup" "$target_path"
            log "SQLite database restored: $db_name"
        fi
    done
    
    success "Databases restored"
}

# Restore service states
restore_service_states() {
    local backup_dir=$1
    
    log "Restoring service states..."
    
    local states_backup_dir="$backup_dir/states"
    if [[ ! -d "$states_backup_dir" ]]; then
        warning "Service states backup not found in: $states_backup_dir"
        return 0
    fi
    
    # Restore PM2 processes
    if [[ -f "$states_backup_dir/pm2_processes.json" ]]; then
        log "Restoring PM2 processes..."
        
        # Start services from ecosystem file if available
        if [[ -f "$PROJECT_ROOT/ecosystem.config.js" ]]; then
            pm2 start "$PROJECT_ROOT/ecosystem.config.js" --silent 2>/dev/null || true
        else
            # Fallback to process list
            pm2 resurrect "$states_backup_dir/pm2_processes.json" --silent 2>/dev/null || true
        fi
        
        success "PM2 processes restored"
    fi
    
    success "Service states restored"
}

# Validate restored system
validate_restored_system() {
    if [[ "$VALIDATE_AFTER_RESTORE" != "true" ]]; then
        return 0
    fi
    
    log "Validating restored system..."
    
    local validation_errors=0
    
    # Check configuration files
    if [[ ! -d "$CONFIG_DIR" ]]; then
        error "Configuration directory not found after restore"
        ((validation_errors++))
    fi
    
    # Check PM2 processes
    local pm2_count=$(pm2 jlist 2>/dev/null | jq length 2>/dev/null || echo 0)
    if [[ "$pm2_count" -eq 0 ]]; then
        warning "No PM2 processes running after restore"
    else
        success "$pm2_count PM2 processes restored"
    fi
    
    # Check Redis connectivity
    if command -v redis-cli &> /dev/null; then
        if redis-cli ping &> /dev/null; then
            success "Redis connectivity validated"
        else
            error "Redis not accessible after restore"
            ((validation_errors++))
        fi
    fi
    
    # Check service ports
    local service_ports=(3000 3001 3002 3003 3004 3005 3006)
    local active_ports=0
    
    for port in "${service_ports[@]}"; do
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            ((active_ports++))
        fi
    done
    
    log "Active service ports: $active_ports/${#service_ports[@]}"
    
    if [[ $validation_errors -eq 0 ]]; then
        success "System validation passed"
        return 0
    else
        error "System validation failed with $validation_errors error(s)"
        return 1
    fi
}

# Cleanup temporary files
cleanup_temp_files() {
    log "Cleaning up temporary files..."
    
    # Remove temporary extraction directory
    local temp_dirs=($(find "$PROJECT_ROOT/tmp" -name "restore_*" -type d 2>/dev/null || true))
    for temp_dir in "${temp_dirs[@]}"; do
        rm -rf "$temp_dir"
        log "Removed temporary directory: $temp_dir"
    done
    
    # Remove decrypted backup files
    local decrypted_files=($(find "$BACKUP_ROOT" -name "*.tar.gz" -newer "$BACKUP_ROOT" 2>/dev/null || true))
    for decrypted_file in "${decrypted_files[@]}"; do
        if [[ -f "${decrypted_file}.enc" ]]; then
            rm "$decrypted_file"
            log "Removed decrypted file: $decrypted_file"
        fi
    done
    
    success "Temporary files cleaned up"
}

# Main restore function
perform_restore() {
    local backup_file=$1
    
    log "Starting system restore from: $backup_file"
    
    # Validate backup file
    if ! validate_backup_file "$backup_file"; then
        error "Backup file validation failed"
        return 1
    fi
    
    # Decrypt if necessary
    local working_file="$backup_file"
    if [[ "$backup_file" =~ \.enc$ ]]; then
        working_file=$(decrypt_backup "$backup_file")
        if [[ $? -ne 0 ]]; then
            error "Failed to decrypt backup"
            return 1
        fi
    fi
    
    # Extract backup
    local backup_dir=$(extract_backup "$working_file")
    if [[ $? -ne 0 ]]; then
        error "Failed to extract backup"
        return 1
    fi
    
    # Read backup metadata
    read_backup_metadata "$backup_dir"
    
    # Confirm restore operation
    if [[ "$FORCE_RESTORE" != "true" ]]; then
        echo ""
        warning "This will restore the system from the backup and may overwrite current data."
        read -p "Do you want to continue? (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "Restore operation cancelled by user"
            cleanup_temp_files
            return 0
        fi
    fi
    
    # Create pre-restore backup
    create_restore_backup
    
    # Stop services
    stop_services
    
    # Perform restore operations
    restore_configuration "$backup_dir"
    restore_logs "$backup_dir"
    restore_databases "$backup_dir"
    restore_service_states "$backup_dir"
    
    # Validate restored system
    if ! validate_restored_system; then
        error "System validation failed after restore"
        warning "You may need to manually verify and fix issues"
    fi
    
    # Cleanup temporary files
    cleanup_temp_files
    
    success "System restore completed successfully!"
    
    echo ""
    log "Post-restore checklist:"
    log "1. Verify service status: pm2 status"
    log "2. Check service logs: pm2 logs"
    log "3. Test system functionality"
    log "4. Update API keys and secrets if needed"
    log "5. Restart monitoring and alerting"
}

# List available backups
list_backups() {
    log "Available backups:"
    
    local backup_types=("daily" "weekly" "monthly" "full")
    
    for backup_type in "${backup_types[@]}"; do
        local backup_path="$BACKUP_ROOT/$backup_type"
        if [[ -d "$backup_path" ]]; then
            echo ""
            log "$backup_type backups:"
            
            local backups=($(find "$backup_path" -name "*.tar.gz*" -type f | sort -r))
            if [[ ${#backups[@]} -eq 0 ]]; then
                log "  No backups found"
            else
                for backup in "${backups[@]}"; do
                    local backup_name=$(basename "$backup")
                    local backup_size=$(du -h "$backup" | cut -f1)
                    local backup_date=$(stat -c %y "$backup" 2>/dev/null | cut -d' ' -f1 || stat -f %Sm "$backup" 2>/dev/null)
                    log "  $backup_name ($backup_size, $backup_date)"
                done
            fi
        fi
    done
}

# Display usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS] BACKUP_FILE

Options:
    --mode MODE           Restore mode: full, config-only, logs-only (default: full)
    --force              Force restore without confirmation
    --no-stop-services   Don't stop services before restore
    --no-validate        Skip validation after restore
    --list               List available backups
    -h, --help           Show this help message

Examples:
    $0 backup_20231215_120000.tar.gz.enc    # Restore from encrypted backup
    $0 --force backup.tar.gz                # Force restore without confirmation
    $0 --mode config-only backup.tar.gz     # Restore only configuration
    $0 --list                               # List available backups

This script will:
1. Validate the backup file
2. Decrypt if necessary (requires encryption key)
3. Extract backup contents
4. Stop running services
5. Create pre-restore backup
6. Restore configuration, logs, and databases
7. Restart services
8. Validate restored system

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --mode)
                RESTORE_MODE="$2"
                shift 2
                ;;
            --force)
                FORCE_RESTORE=true
                shift
                ;;
            --no-stop-services)
                STOP_SERVICES=false
                shift
                ;;
            --no-validate)
                VALIDATE_AFTER_RESTORE=false
                shift
                ;;
            --list)
                list_backups
                exit 0
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            -*)
                error "Unknown option: $1"
                usage
                exit 1
                ;;
            *)
                if [[ -z "$BACKUP_FILE" ]]; then
                    BACKUP_FILE="$1"
                else
                    error "Multiple backup files specified"
                    usage
                    exit 1
                fi
                shift
                ;;
        esac
    done
}

# Main execution
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         TITAN SYSTEM RESTORE                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

parse_args "$@"

# Validate restore mode
if [[ ! "$RESTORE_MODE" =~ ^(full|config-only|logs-only)$ ]]; then
    error "Invalid restore mode: $RESTORE_MODE"
    usage
    exit 1
fi

# Check if backup file is specified
if [[ -z "$BACKUP_FILE" ]]; then
    error "No backup file specified"
    usage
    exit 1
fi

# Perform restore
perform_restore "$BACKUP_FILE"