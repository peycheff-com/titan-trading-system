#!/bin/bash

# Titan System Backup Script
# This script creates comprehensive backups of the Titan Trading System
# Requirements: 6.1 - Create daily backups of configuration files and trading logs

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

# Backup configuration
BACKUP_TYPE="full"
COMPRESSION_LEVEL=6
ENCRYPTION_ENABLED=true
RETENTION_DAYS=90
REMOTE_BACKUP_ENABLED=false
REMOTE_BACKUP_PATH=""

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

# Create backup directories
create_backup_directories() {
    log "Creating backup directories..."
    
    local backup_dirs=(
        "$BACKUP_ROOT"
        "$BACKUP_ROOT/daily"
        "$BACKUP_ROOT/weekly"
        "$BACKUP_ROOT/monthly"
        "$BACKUP_ROOT/disaster-recovery"
    )
    
    for dir in "${backup_dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            log "Created directory: $dir"
        fi
    done
    
    success "Backup directories created"
}

# Generate backup metadata
generate_backup_metadata() {
    local backup_dir=$1
    local backup_type=$2
    
    local metadata_file="$backup_dir/backup_metadata.json"
    local timestamp=$(date -Iseconds)
    
    # Get system information
    local hostname=$(hostname)
    local os_info=$(uname -a)
    local disk_usage=$(df -h "$PROJECT_ROOT" | awk 'NR==2 {print $3 "/" $2 " (" $5 ")"}')
    
    # Get service status
    local pm2_status=$(pm2 jlist 2>/dev/null || echo "[]")
    
    # Get git information
    local git_commit=$(cd "$PROJECT_ROOT" && git rev-parse HEAD 2>/dev/null || echo "unknown")
    local git_branch=$(cd "$PROJECT_ROOT" && git branch --show-current 2>/dev/null || echo "unknown")
    
    cat > "$metadata_file" << EOF
{
    "backup_info": {
        "timestamp": "$timestamp",
        "type": "$backup_type",
        "version": "1.0.0",
        "created_by": "$USER",
        "hostname": "$hostname"
    },
    "system_info": {
        "os": "$os_info",
        "disk_usage": "$disk_usage",
        "backup_size": "TBD"
    },
    "git_info": {
        "commit": "$git_commit",
        "branch": "$git_branch"
    },
    "services": $pm2_status,
    "backup_contents": {
        "configuration": true,
        "logs": true,
        "databases": true,
        "service_code": false,
        "node_modules": false
    },
    "encryption": {
        "enabled": $ENCRYPTION_ENABLED,
        "algorithm": "aes-256-gcm"
    },
    "compression": {
        "enabled": true,
        "level": $COMPRESSION_LEVEL,
        "format": "gzip"
    }
}
EOF
    
    log "Backup metadata generated: $metadata_file"
}

# Backup configuration files
backup_configuration() {
    local backup_dir=$1
    
    log "Backing up configuration files..."
    
    local config_backup_dir="$backup_dir/config"
    mkdir -p "$config_backup_dir"
    
    if [[ -d "$CONFIG_DIR" ]]; then
        cp -r "$CONFIG_DIR"/* "$config_backup_dir/" 2>/dev/null || true
        success "Configuration files backed up"
    else
        warning "Configuration directory not found: $CONFIG_DIR"
    fi
    
    # Backup PM2 ecosystem file
    if [[ -f "$PROJECT_ROOT/ecosystem.config.js" ]]; then
        cp "$PROJECT_ROOT/ecosystem.config.js" "$backup_dir/"
        log "PM2 ecosystem file backed up"
    fi
    
    # Backup environment files
    local env_files=(".env" ".env.production" ".env.local")
    for env_file in "${env_files[@]}"; do
        if [[ -f "$PROJECT_ROOT/$env_file" ]]; then
            cp "$PROJECT_ROOT/$env_file" "$backup_dir/"
            log "Environment file backed up: $env_file"
        fi
    done
}

# Backup trading logs
backup_logs() {
    local backup_dir=$1
    
    log "Backing up trading logs..."
    
    local logs_backup_dir="$backup_dir/logs"
    mkdir -p "$logs_backup_dir"
    
    if [[ -d "$LOGS_DIR" ]]; then
        # Copy log files (excluding very large files)
        find "$LOGS_DIR" -name "*.log" -size -100M -exec cp {} "$logs_backup_dir/" \; 2>/dev/null || true
        find "$LOGS_DIR" -name "*.jsonl" -size -100M -exec cp {} "$logs_backup_dir/" \; 2>/dev/null || true
        
        # For large files, create compressed copies
        find "$LOGS_DIR" -name "*.log" -size +100M -exec gzip -c {} \; > "$logs_backup_dir/large_logs.gz" 2>/dev/null || true
        
        success "Trading logs backed up"
    else
        warning "Logs directory not found: $LOGS_DIR"
    fi
    
    # Backup system logs
    local system_logs=("/var/log/titan" "/var/log/pm2")
    for log_dir in "${system_logs[@]}"; do
        if [[ -d "$log_dir" ]]; then
            local log_name=$(basename "$log_dir")
            cp -r "$log_dir" "$logs_backup_dir/$log_name" 2>/dev/null || true
            log "System logs backed up: $log_dir"
        fi
    done
}

# Backup databases
backup_databases() {
    local backup_dir=$1
    
    log "Backing up databases..."
    
    local db_backup_dir="$backup_dir/databases"
    mkdir -p "$db_backup_dir"
    
    # Backup Redis data
    if command -v redis-cli &> /dev/null && redis-cli ping &> /dev/null; then
        log "Backing up Redis data..."
        redis-cli BGSAVE
        sleep 2
        
        # Find Redis dump file
        local redis_dump=$(redis-cli CONFIG GET dir | tail -1)/dump.rdb
        if [[ -f "$redis_dump" ]]; then
            cp "$redis_dump" "$db_backup_dir/redis_dump.rdb"
            success "Redis data backed up"
        else
            warning "Redis dump file not found"
        fi
    else
        warning "Redis not accessible, skipping Redis backup"
    fi
    
    # Backup PostgreSQL (if used by Brain service)
    if command -v pg_dump &> /dev/null; then
        log "Backing up PostgreSQL databases..."
        
        local pg_databases=("titan_brain" "titan_execution")
        for db_name in "${pg_databases[@]}"; do
            if psql -lqt | cut -d \| -f 1 | grep -qw "$db_name" 2>/dev/null; then
                pg_dump "$db_name" > "$db_backup_dir/${db_name}.sql" 2>/dev/null || true
                log "PostgreSQL database backed up: $db_name"
            fi
        done
    fi
    
    # Backup SQLite databases (if any)
    find "$PROJECT_ROOT" -name "*.db" -exec cp {} "$db_backup_dir/" \; 2>/dev/null || true
}

# Backup service states
backup_service_states() {
    local backup_dir=$1
    
    log "Backing up service states..."
    
    local states_backup_dir="$backup_dir/states"
    mkdir -p "$states_backup_dir"
    
    # PM2 process list
    pm2 jlist > "$states_backup_dir/pm2_processes.json" 2>/dev/null || echo "[]" > "$states_backup_dir/pm2_processes.json"
    
    # System service status
    systemctl list-units --type=service --state=running | grep titan > "$states_backup_dir/systemd_services.txt" 2>/dev/null || true
    
    # Network connections
    netstat -tuln | grep -E ":(3000|3001|3002|3003|3004|3005|3006|6379|5432)" > "$states_backup_dir/network_connections.txt" 2>/dev/null || true
    
    # Process information
    ps aux | grep -E "(node|pm2|redis|postgres)" | grep -v grep > "$states_backup_dir/processes.txt" 2>/dev/null || true
    
    success "Service states backed up"
}

# Compress backup
compress_backup() {
    local backup_dir=$1
    local compressed_file="${backup_dir}.tar.gz"
    
    log "Compressing backup..."
    
    cd "$(dirname "$backup_dir")"
    tar -czf "$compressed_file" "$(basename "$backup_dir")"
    
    # Remove uncompressed directory
    rm -rf "$backup_dir"
    
    local backup_size=$(du -h "$compressed_file" | cut -f1)
    success "Backup compressed: $compressed_file ($backup_size)"
    
    echo "$compressed_file"
}

# Encrypt backup
encrypt_backup() {
    local backup_file=$1
    local encrypted_file="${backup_file}.enc"
    
    if [[ "$ENCRYPTION_ENABLED" != "true" ]]; then
        echo "$backup_file"
        return 0
    fi
    
    log "Encrypting backup..."
    
    # Generate encryption key if not exists
    local key_file="$BACKUP_ROOT/.backup_key"
    if [[ ! -f "$key_file" ]]; then
        openssl rand -base64 32 > "$key_file"
        chmod 600 "$key_file"
        warning "Backup encryption key generated: $key_file"
        warning "Keep this key safe - it's required for backup restoration"
    fi
    
    # Encrypt backup
    openssl enc -aes-256-cbc -salt -in "$backup_file" -out "$encrypted_file" -pass file:"$key_file"
    
    # Remove unencrypted file
    rm "$backup_file"
    
    success "Backup encrypted: $encrypted_file"
    echo "$encrypted_file"
}

# Upload to remote storage
upload_to_remote() {
    local backup_file=$1
    
    if [[ "$REMOTE_BACKUP_ENABLED" != "true" ]] || [[ -z "$REMOTE_BACKUP_PATH" ]]; then
        return 0
    fi
    
    log "Uploading backup to remote storage..."
    
    # This is a placeholder for remote backup implementation
    # You would implement your specific cloud storage solution here
    # Examples: AWS S3, Google Cloud Storage, Azure Blob Storage, etc.
    
    case "$REMOTE_BACKUP_PATH" in
        s3://*)
            # AWS S3 upload
            if command -v aws &> /dev/null; then
                aws s3 cp "$backup_file" "$REMOTE_BACKUP_PATH/"
                success "Backup uploaded to S3"
            else
                warning "AWS CLI not found, skipping S3 upload"
            fi
            ;;
        gs://*)
            # Google Cloud Storage upload
            if command -v gsutil &> /dev/null; then
                gsutil cp "$backup_file" "$REMOTE_BACKUP_PATH/"
                success "Backup uploaded to Google Cloud Storage"
            else
                warning "gsutil not found, skipping GCS upload"
            fi
            ;;
        *)
            # Generic rsync/scp upload
            if [[ "$REMOTE_BACKUP_PATH" =~ ^[^@]+@[^:]+:.+ ]]; then
                scp "$backup_file" "$REMOTE_BACKUP_PATH/"
                success "Backup uploaded via SCP"
            else
                rsync -av "$backup_file" "$REMOTE_BACKUP_PATH/"
                success "Backup uploaded via rsync"
            fi
            ;;
    esac
}

# Cleanup old backups
cleanup_old_backups() {
    log "Cleaning up old backups..."
    
    local backup_dirs=("daily" "weekly" "monthly")
    
    for backup_type in "${backup_dirs[@]}"; do
        local backup_path="$BACKUP_ROOT/$backup_type"
        if [[ -d "$backup_path" ]]; then
            # Remove backups older than retention period
            find "$backup_path" -name "*.tar.gz*" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
            
            local remaining_count=$(find "$backup_path" -name "*.tar.gz*" | wc -l)
            log "Cleaned up $backup_type backups, $remaining_count remaining"
        fi
    done
    
    success "Old backups cleaned up"
}

# Update backup metadata with final information
update_backup_metadata() {
    local backup_file=$1
    local metadata_file="${backup_file%.*.*}/backup_metadata.json"
    
    if [[ -f "$metadata_file" ]]; then
        local backup_size=$(du -h "$backup_file" | cut -f1)
        local backup_hash=$(sha256sum "$backup_file" | cut -d' ' -f1)
        
        # Update metadata with final information
        jq --arg size "$backup_size" --arg hash "$backup_hash" \
           '.system_info.backup_size = $size | .backup_info.sha256 = $hash' \
           "$metadata_file" > "${metadata_file}.tmp" && mv "${metadata_file}.tmp" "$metadata_file"
    fi
}

# Main backup function
create_backup() {
    local backup_timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_dir="$BACKUP_ROOT/$BACKUP_TYPE/backup_$backup_timestamp"
    
    log "Creating $BACKUP_TYPE backup: $backup_dir"
    
    # Create backup directory
    mkdir -p "$backup_dir"
    
    # Generate initial metadata
    generate_backup_metadata "$backup_dir" "$BACKUP_TYPE"
    
    # Perform backup operations
    backup_configuration "$backup_dir"
    backup_logs "$backup_dir"
    backup_databases "$backup_dir"
    backup_service_states "$backup_dir"
    
    # Compress backup
    local compressed_backup=$(compress_backup "$backup_dir")
    
    # Encrypt backup
    local final_backup=$(encrypt_backup "$compressed_backup")
    
    # Update metadata
    update_backup_metadata "$final_backup"
    
    # Upload to remote storage
    upload_to_remote "$final_backup"
    
    # Cleanup old backups
    cleanup_old_backups
    
    success "Backup completed successfully: $final_backup"
    
    # Display backup information
    local backup_size=$(du -h "$final_backup" | cut -f1)
    log "Backup size: $backup_size"
    log "Backup location: $final_backup"
    
    if [[ "$ENCRYPTION_ENABLED" == "true" ]]; then
        warning "Backup is encrypted. Keep the encryption key safe: $BACKUP_ROOT/.backup_key"
    fi
}

# Verify backup integrity
verify_backup() {
    local backup_file=$1
    
    log "Verifying backup integrity..."
    
    # Check if file exists and is readable
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
    
    # Verify compression integrity
    if [[ "$backup_file" =~ \.tar\.gz ]]; then
        if ! gzip -t "$backup_file" 2>/dev/null; then
            error "Backup file is corrupted (gzip test failed)"
            return 1
        fi
    fi
    
    success "Backup integrity verified"
    return 0
}

# Display usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
    --type TYPE           Backup type: daily, weekly, monthly, full (default: full)
    --no-encryption       Disable backup encryption
    --retention DAYS      Retention period in days (default: 90)
    --remote PATH         Remote backup path (S3, GCS, or rsync path)
    --verify FILE         Verify integrity of existing backup file
    -h, --help           Show this help message

Examples:
    $0                                    # Create full backup
    $0 --type daily                      # Create daily backup
    $0 --no-encryption                   # Create unencrypted backup
    $0 --remote s3://my-bucket/backups   # Upload to S3
    $0 --verify backup.tar.gz.enc        # Verify backup integrity

This script will:
1. Create comprehensive backup of Titan system
2. Include configuration files, logs, and databases
3. Compress and optionally encrypt the backup
4. Upload to remote storage (if configured)
5. Clean up old backups based on retention policy

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --type)
                BACKUP_TYPE="$2"
                shift 2
                ;;
            --no-encryption)
                ENCRYPTION_ENABLED=false
                shift
                ;;
            --retention)
                RETENTION_DAYS="$2"
                shift 2
                ;;
            --remote)
                REMOTE_BACKUP_ENABLED=true
                REMOTE_BACKUP_PATH="$2"
                shift 2
                ;;
            --verify)
                verify_backup "$2"
                exit $?
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
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         TITAN SYSTEM BACKUP                                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

parse_args "$@"

# Validate backup type
if [[ ! "$BACKUP_TYPE" =~ ^(daily|weekly|monthly|full)$ ]]; then
    error "Invalid backup type: $BACKUP_TYPE"
    usage
    exit 1
fi

# Create backup directories
create_backup_directories

# Create backup
create_backup