#!/bin/bash

# Automated Backup Scheduler for Titan Trading System
# Requirements: 7.5 - Automated database backup with retention policies

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
LOG_DIR="${LOG_DIR:-./logs}"
BACKUP_LOG="$LOG_DIR/backup-scheduler.log"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
BACKUP_INTERVAL="${BACKUP_INTERVAL:-daily}"  # hourly, daily, weekly
MAX_PARALLEL_BACKUPS=2

# S3 Configuration (optional)
S3_ENABLED="${S3_BACKUP_ENABLED:-false}"
S3_BUCKET="${AWS_S3_BUCKET:-}"
S3_REGION="${AWS_REGION:-us-east-1}"

# Notification Configuration
WEBHOOK_URL="${BACKUP_WEBHOOK_URL:-}"
EMAIL_RECIPIENT="${BACKUP_EMAIL:-}"

echo -e "${PURPLE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║         TITAN BACKUP SCHEDULER                             ║${NC}"
echo -e "${PURPLE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Ensure directories exist
mkdir -p "$BACKUP_DIR" "$LOG_DIR"

# Logging function
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "[$timestamp] [$level] $message" | tee -a "$BACKUP_LOG"
}

# Function to send notifications
send_notification() {
    local status=$1
    local message=$2
    local details=$3
    
    # Webhook notification
    if [ -n "$WEBHOOK_URL" ]; then
        curl -s -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{
                \"status\": \"$status\",
                \"message\": \"$message\",
                \"details\": \"$details\",
                \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
                \"hostname\": \"$(hostname)\"
            }" || log "WARN" "Failed to send webhook notification"
    fi
    
    # Email notification (if configured)
    if [ -n "$EMAIL_RECIPIENT" ] && command -v mail >/dev/null 2>&1; then
        echo -e "Backup Status: $status\n\nMessage: $message\n\nDetails:\n$details" | \
            mail -s "Titan Backup Report - $status" "$EMAIL_RECIPIENT" || \
            log "WARN" "Failed to send email notification"
    fi
}

# Function to backup a single service
backup_service() {
    local service_name=$1
    local service_path=$2
    local backup_type=$3  # database, config, logs
    
    log "INFO" "Starting $backup_type backup for $service_name"
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$BACKUP_DIR/${service_name}_${backup_type}_${timestamp}"
    
    case "$backup_type" in
        "database")
            backup_database "$service_name" "$service_path" "$backup_file"
            ;;
        "config")
            backup_config "$service_name" "$service_path" "$backup_file"
            ;;
        "logs")
            backup_logs "$service_name" "$service_path" "$backup_file"
            ;;
        *)
            log "ERROR" "Unknown backup type: $backup_type"
            return 1
            ;;
    esac
    
    local exit_code=$?
    if [ $exit_code -eq 0 ]; then
        log "INFO" "Successfully backed up $service_name $backup_type"
        
        # Compress backup
        if [ -f "$backup_file" ]; then
            gzip "$backup_file"
            backup_file="${backup_file}.gz"
            log "INFO" "Compressed backup: $backup_file"
        fi
        
        # Upload to S3 if enabled
        if [ "$S3_ENABLED" = "true" ] && [ -n "$S3_BUCKET" ]; then
            upload_to_s3 "$backup_file" "$service_name/$backup_type/"
        fi
        
        return 0
    else
        log "ERROR" "Failed to backup $service_name $backup_type"
        return 1
    fi
}

# Function to backup database
backup_database() {
    local service_name=$1
    local service_path=$2
    local backup_file=$3
    
    case "$service_name" in
        "titan-execution")
            if [ -f "$service_path/titan_execution.db" ]; then
                # SQLite backup with integrity check
                sqlite3 "$service_path/titan_execution.db" ".backup $backup_file.db"
                
                # Verify backup integrity
                if sqlite3 "$backup_file.db" "PRAGMA integrity_check;" | grep -q "ok"; then
                    mv "$backup_file.db" "$backup_file"
                    log "INFO" "SQLite backup verified for $service_name"
                else
                    log "ERROR" "SQLite backup integrity check failed for $service_name"
                    rm -f "$backup_file.db"
                    return 1
                fi
            else
                log "WARN" "Database file not found for $service_name"
                return 1
            fi
            ;;
        "titan-brain")
            # PostgreSQL backup
            local db_name="${DB_NAME:-titan_brain}"
            local db_host="${DB_HOST:-localhost}"
            local db_port="${DB_PORT:-5432}"
            local db_user="${DB_USER:-titan}"
            
            if command -v pg_dump >/dev/null 2>&1; then
                PGPASSWORD="$DB_PASSWORD" pg_dump \
                    -h "$db_host" \
                    -p "$db_port" \
                    -U "$db_user" \
                    -d "$db_name" \
                    --no-password \
                    --verbose \
                    > "$backup_file.sql" 2>/dev/null
                
                if [ $? -eq 0 ] && [ -s "$backup_file.sql" ]; then
                    mv "$backup_file.sql" "$backup_file"
                    log "INFO" "PostgreSQL backup completed for $service_name"
                else
                    log "ERROR" "PostgreSQL backup failed for $service_name"
                    rm -f "$backup_file.sql"
                    return 1
                fi
            else
                log "ERROR" "pg_dump not found, cannot backup PostgreSQL"
                return 1
            fi
            ;;
        *)
            log "WARN" "No database backup method defined for $service_name"
            return 1
            ;;
    esac
}

# Function to backup configuration
backup_config() {
    local service_name=$1
    local service_path=$2
    local backup_file=$3
    
    # Create tar archive of configuration files
    local config_files=()
    
    # Find configuration files
    if [ -f "$service_path/.env" ]; then
        config_files+=("$service_path/.env")
    fi
    if [ -f "$service_path/package.json" ]; then
        config_files+=("$service_path/package.json")
    fi
    if [ -f "$service_path/config.json" ]; then
        config_files+=("$service_path/config.json")
    fi
    if [ -d "$service_path/config" ]; then
        config_files+=("$service_path/config")
    fi
    
    if [ ${#config_files[@]} -gt 0 ]; then
        tar -czf "$backup_file.tar.gz" "${config_files[@]}" 2>/dev/null
        if [ $? -eq 0 ]; then
            mv "$backup_file.tar.gz" "$backup_file"
            log "INFO" "Configuration backup completed for $service_name"
        else
            log "ERROR" "Configuration backup failed for $service_name"
            return 1
        fi
    else
        log "WARN" "No configuration files found for $service_name"
        return 1
    fi
}

# Function to backup logs
backup_logs() {
    local service_name=$1
    local service_path=$2
    local backup_file=$3
    
    local log_files=()
    
    # Find log files
    if [ -d "$service_path/logs" ]; then
        log_files+=($(find "$service_path/logs" -name "*.log" -type f))
    fi
    
    # Also check main logs directory
    if [ -d "./logs" ]; then
        log_files+=($(find "./logs" -name "*${service_name}*.log" -type f))
    fi
    
    if [ ${#log_files[@]} -gt 0 ]; then
        tar -czf "$backup_file.tar.gz" "${log_files[@]}" 2>/dev/null
        if [ $? -eq 0 ]; then
            mv "$backup_file.tar.gz" "$backup_file"
            log "INFO" "Log backup completed for $service_name (${#log_files[@]} files)"
        else
            log "ERROR" "Log backup failed for $service_name"
            return 1
        fi
    else
        log "WARN" "No log files found for $service_name"
        return 1
    fi
}

# Function to upload to S3
upload_to_s3() {
    local file_path=$1
    local s3_prefix=$2
    
    if ! command -v aws >/dev/null 2>&1; then
        log "WARN" "AWS CLI not found, skipping S3 upload"
        return 1
    fi
    
    local file_name=$(basename "$file_path")
    local s3_key="${s3_prefix}${file_name}"
    
    log "INFO" "Uploading to S3: s3://$S3_BUCKET/$s3_key"
    
    aws s3 cp "$file_path" "s3://$S3_BUCKET/$s3_key" \
        --region "$S3_REGION" \
        --storage-class STANDARD_IA \
        --metadata "backup-timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ),hostname=$(hostname)" \
        2>/dev/null
    
    if [ $? -eq 0 ]; then
        log "INFO" "Successfully uploaded to S3: $s3_key"
    else
        log "ERROR" "Failed to upload to S3: $s3_key"
        return 1
    fi
}

# Function to cleanup old backups
cleanup_old_backups() {
    log "INFO" "Cleaning up backups older than $RETENTION_DAYS days"
    
    local deleted_count=0
    local total_size=0
    
    # Find and delete old backup files
    find "$BACKUP_DIR" -name "*.gz" -type f -mtime +$RETENTION_DAYS | while read file; do
        local file_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
        total_size=$((total_size + file_size))
        
        log "INFO" "Deleting old backup: $(basename "$file")"
        rm -f "$file"
        deleted_count=$((deleted_count + 1))
    done
    
    if [ $deleted_count -gt 0 ]; then
        log "INFO" "Deleted $deleted_count old backup files ($(echo $total_size | numfmt --to=iec))"
    else
        log "INFO" "No old backups to delete"
    fi
    
    # Cleanup S3 old backups if enabled
    if [ "$S3_ENABLED" = "true" ] && [ -n "$S3_BUCKET" ] && command -v aws >/dev/null 2>&1; then
        log "INFO" "Cleaning up old S3 backups"
        
        local cutoff_date=$(date -d "$RETENTION_DAYS days ago" +%Y-%m-%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y-%m-%d)
        
        aws s3api list-objects-v2 \
            --bucket "$S3_BUCKET" \
            --prefix "titan-backups/" \
            --query "Contents[?LastModified<'$cutoff_date'].Key" \
            --output text | while read key; do
            if [ -n "$key" ] && [ "$key" != "None" ]; then
                log "INFO" "Deleting old S3 backup: $key"
                aws s3 rm "s3://$S3_BUCKET/$key"
            fi
        done
    fi
}

# Function to verify backup integrity
verify_backups() {
    log "INFO" "Verifying recent backup integrity"
    
    local verification_errors=0
    
    # Find backups from last 24 hours
    find "$BACKUP_DIR" -name "*.gz" -type f -mtime -1 | while read backup_file; do
        log "INFO" "Verifying: $(basename "$backup_file")"
        
        # Test gzip integrity
        if ! gzip -t "$backup_file" 2>/dev/null; then
            log "ERROR" "Backup file corrupted: $backup_file"
            verification_errors=$((verification_errors + 1))
            continue
        fi
        
        # Additional verification based on backup type
        if echo "$backup_file" | grep -q "_database_"; then
            # For database backups, try to extract and verify
            local temp_file=$(mktemp)
            if gunzip -c "$backup_file" > "$temp_file" 2>/dev/null; then
                if echo "$backup_file" | grep -q "titan-execution"; then
                    # SQLite verification
                    if ! sqlite3 "$temp_file" "PRAGMA integrity_check;" | grep -q "ok" 2>/dev/null; then
                        log "ERROR" "SQLite backup integrity check failed: $backup_file"
                        verification_errors=$((verification_errors + 1))
                    fi
                elif echo "$backup_file" | grep -q "titan-brain"; then
                    # PostgreSQL dump verification (basic check)
                    if ! grep -q "PostgreSQL database dump" "$temp_file" 2>/dev/null; then
                        log "ERROR" "PostgreSQL backup format check failed: $backup_file"
                        verification_errors=$((verification_errors + 1))
                    fi
                fi
            else
                log "ERROR" "Failed to extract backup for verification: $backup_file"
                verification_errors=$((verification_errors + 1))
            fi
            rm -f "$temp_file"
        fi
        
        log "INFO" "Backup verified: $(basename "$backup_file")"
    done
    
    if [ $verification_errors -eq 0 ]; then
        log "INFO" "All recent backups verified successfully"
    else
        log "ERROR" "$verification_errors backup verification errors found"
    fi
    
    return $verification_errors
}

# Main backup execution
main() {
    log "INFO" "Starting backup scheduler (interval: $BACKUP_INTERVAL, retention: $RETENTION_DAYS days)"
    
    local start_time=$(date +%s)
    local total_backups=0
    local failed_backups=0
    local backup_details=""
    
    # Define services to backup
    local services=(
        "titan-brain:services/titan-brain:database,config"
        "titan-execution:services/titan-execution:database,config,logs"
        "titan-console:services/titan-console:config"
        "titan-scavenger:services/titan-phase1-scavenger:config,logs"
        "titan-ai-quant:services/titan-ai-quant:config,logs"
    )
    
    # Backup each service
    for service_info in "${services[@]}"; do
        IFS=':' read -r service_name service_path backup_types <<< "$service_info"
        
        if [ ! -d "$service_path" ]; then
            log "WARN" "Service directory not found: $service_path, skipping..."
            continue
        fi
        
        IFS=',' read -ra types <<< "$backup_types"
        for backup_type in "${types[@]}"; do
            total_backups=$((total_backups + 1))
            
            if backup_service "$service_name" "$service_path" "$backup_type"; then
                backup_details="${backup_details}✅ $service_name ($backup_type)\n"
            else
                failed_backups=$((failed_backups + 1))
                backup_details="${backup_details}❌ $service_name ($backup_type)\n"
            fi
        done
    done
    
    # Cleanup old backups
    cleanup_old_backups
    
    # Verify backup integrity
    verify_backups
    local verification_exit_code=$?
    
    # Calculate execution time
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Generate summary
    local success_count=$((total_backups - failed_backups))
    local status="SUCCESS"
    
    if [ $failed_backups -gt 0 ] || [ $verification_exit_code -ne 0 ]; then
        status="PARTIAL_FAILURE"
    fi
    
    if [ $success_count -eq 0 ]; then
        status="FAILURE"
    fi
    
    local summary="Backup completed: $success_count/$total_backups successful (${duration}s)"
    log "INFO" "$summary"
    
    # Send notification
    send_notification "$status" "$summary" "$backup_details"
    
    # Exit with appropriate code
    if [ "$status" = "SUCCESS" ]; then
        exit 0
    else
        exit 1
    fi
}

# Parse command line arguments
case "${1:-}" in
    --verify)
        verify_backups
        exit $?
        ;;
    --cleanup)
        cleanup_old_backups
        exit 0
        ;;
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo "Options:"
        echo "  --verify    Verify recent backup integrity"
        echo "  --cleanup   Cleanup old backups"
        echo "  --help      Show this help"
        exit 0
        ;;
    *)
        main
        ;;
esac