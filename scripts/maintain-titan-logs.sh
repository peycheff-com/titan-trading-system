#!/bin/bash

# Titan Log Maintenance Script
# This script handles log rotation, compression, and cleanup for the Titan Trading System
# Requirements: 9.4 - Implement log rotation to prevent disk space issues

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOGS_DIR="$PROJECT_ROOT/logs"
BACKUP_DIR="$PROJECT_ROOT/backups/logs"
CONFIG_DIR="$PROJECT_ROOT/config"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Log maintenance configuration
MAX_LOG_SIZE="10M"
MAX_LOG_AGE_DAYS=30
COMPRESSED_LOG_AGE_DAYS=90
BACKUP_LOG_AGE_DAYS=365
COMPRESSION_LEVEL=6
MAINTENANCE_MODE="auto"

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

# Create maintenance directories
create_maintenance_directories() {
    log "Creating maintenance directories..."
    
    local maintenance_dirs=(
        "$BACKUP_DIR"
        "$BACKUP_DIR/rotated"
        "$BACKUP_DIR/compressed"
        "$BACKUP_DIR/archived"
        "$LOGS_DIR/archive"
    )
    
    for dir in "${maintenance_dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            log "Created directory: $dir"
        fi
    done
    
    success "Maintenance directories created"
}

# Check disk space
check_disk_space() {
    log "Checking disk space..."
    
    local available_space=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $4}')
    local total_space=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $2}')
    local usage_percent=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $5}' | sed 's/%//')
    
    log "Disk usage: ${usage_percent}% ($(($available_space / 1024))MB available)"
    
    # Warning thresholds
    if [[ $usage_percent -gt 90 ]]; then
        error "Critical disk space: ${usage_percent}% used"
        return 2
    elif [[ $usage_percent -gt 80 ]]; then
        warning "High disk usage: ${usage_percent}% used"
        return 1
    else
        success "Disk space OK: ${usage_percent}% used"
        return 0
    fi
}

# Rotate large log files
rotate_large_logs() {
    log "Rotating large log files..."
    
    local rotated_count=0
    
    # Find log files larger than MAX_LOG_SIZE
    while IFS= read -r -d '' log_file; do
        local file_size=$(stat -c%s "$log_file" 2>/dev/null || stat -f%z "$log_file" 2>/dev/null)
        local max_size_bytes=$(numfmt --from=iec "${MAX_LOG_SIZE}")
        
        if [[ $file_size -gt $max_size_bytes ]]; then
            local base_name=$(basename "$log_file")
            local timestamp=$(date +%Y%m%d_%H%M%S)
            local rotated_name="${base_name}.${timestamp}"
            
            log "Rotating large log file: $base_name ($(numfmt --to=iec $file_size))"
            
            # Move current log to rotated name
            mv "$log_file" "$LOGS_DIR/$rotated_name"
            
            # Create new empty log file with proper permissions
            touch "$log_file"
            chmod 644 "$log_file"
            
            # If it's a PM2 log, restart PM2 to reopen file handles
            if [[ "$base_name" =~ ^(titan-|shared|security) ]]; then
                local service_name=$(echo "$base_name" | sed 's/\.log$//' | sed 's/-error$//')
                if pm2 describe "$service_name" &> /dev/null; then
                    pm2 reload "$service_name" --silent || true
                    log "Reloaded PM2 service: $service_name"
                fi
            fi
            
            ((rotated_count++))
        fi
    done < <(find "$LOGS_DIR" -name "*.log" -type f -print0 2>/dev/null)
    
    if [[ $rotated_count -gt 0 ]]; then
        success "Rotated $rotated_count large log files"
    else
        log "No large log files found for rotation"
    fi
}

# Compress old log files
compress_old_logs() {
    log "Compressing old log files..."
    
    local compressed_count=0
    
    # Find uncompressed log files older than 1 day
    while IFS= read -r -d '' log_file; do
        local base_name=$(basename "$log_file")
        local compressed_name="${base_name}.gz"
        
        # Skip if already compressed
        if [[ "$base_name" =~ \.gz$ ]]; then
            continue
        fi
        
        # Skip current active log files
        if [[ ! "$base_name" =~ \.[0-9]{8}_[0-9]{6}$ ]] && [[ -s "$log_file" ]]; then
            # Check if file is currently being written to
            if lsof "$log_file" &> /dev/null; then
                continue
            fi
        fi
        
        log "Compressing log file: $base_name"
        
        # Compress with specified level
        if gzip -${COMPRESSION_LEVEL} "$log_file"; then
            ((compressed_count++))
        else
            error "Failed to compress: $base_name"
        fi
        
    done < <(find "$LOGS_DIR" -name "*.log" -type f -mtime +1 -print0 2>/dev/null)
    
    # Also compress rotated logs
    while IFS= read -r -d '' log_file; do
        local base_name=$(basename "$log_file")
        
        if [[ "$base_name" =~ \.[0-9]{8}_[0-9]{6}$ ]]; then
            log "Compressing rotated log: $base_name"
            
            if gzip -${COMPRESSION_LEVEL} "$log_file"; then
                ((compressed_count++))
            else
                error "Failed to compress rotated log: $base_name"
            fi
        fi
    done < <(find "$LOGS_DIR" -name "*.log" -type f -print0 2>/dev/null)
    
    if [[ $compressed_count -gt 0 ]]; then
        success "Compressed $compressed_count log files"
    else
        log "No log files found for compression"
    fi
}

# Archive old compressed logs
archive_old_logs() {
    log "Archiving old compressed logs..."
    
    local archived_count=0
    
    # Move compressed logs older than MAX_LOG_AGE_DAYS to archive
    while IFS= read -r -d '' compressed_log; do
        local base_name=$(basename "$compressed_log")
        local archive_path="$LOGS_DIR/archive/$base_name"
        
        log "Archiving compressed log: $base_name"
        
        mv "$compressed_log" "$archive_path"
        ((archived_count++))
        
    done < <(find "$LOGS_DIR" -name "*.gz" -type f -mtime +$MAX_LOG_AGE_DAYS -print0 2>/dev/null)
    
    if [[ $archived_count -gt 0 ]]; then
        success "Archived $archived_count compressed log files"
    else
        log "No compressed logs found for archiving"
    fi
}

# Clean up very old logs
cleanup_old_logs() {
    log "Cleaning up very old logs..."
    
    local deleted_count=0
    
    # Delete archived logs older than COMPRESSED_LOG_AGE_DAYS
    while IFS= read -r -d '' old_log; do
        local base_name=$(basename "$old_log")
        
        log "Deleting old archived log: $base_name"
        
        rm "$old_log"
        ((deleted_count++))
        
    done < <(find "$LOGS_DIR/archive" -name "*.gz" -type f -mtime +$COMPRESSED_LOG_AGE_DAYS -print0 2>/dev/null)
    
    # Clean up backup logs older than BACKUP_LOG_AGE_DAYS
    while IFS= read -r -d '' backup_log; do
        local base_name=$(basename "$backup_log")
        
        log "Deleting old backup log: $base_name"
        
        rm "$backup_log"
        ((deleted_count++))
        
    done < <(find "$BACKUP_DIR" -name "*.gz" -type f -mtime +$BACKUP_LOG_AGE_DAYS -print0 2>/dev/null)
    
    if [[ $deleted_count -gt 0 ]]; then
        success "Deleted $deleted_count old log files"
    else
        log "No old logs found for deletion"
    fi
}

# Clean up empty directories
cleanup_empty_directories() {
    log "Cleaning up empty directories..."
    
    local removed_count=0
    
    # Find and remove empty directories in logs
    while IFS= read -r -d '' empty_dir; do
        if [[ -d "$empty_dir" ]] && [[ -z "$(ls -A "$empty_dir")" ]]; then
            log "Removing empty directory: $(basename "$empty_dir")"
            rmdir "$empty_dir"
            ((removed_count++))
        fi
    done < <(find "$LOGS_DIR" -type d -empty -print0 2>/dev/null)
    
    if [[ $removed_count -gt 0 ]]; then
        success "Removed $removed_count empty directories"
    else
        log "No empty directories found"
    fi
}

# Optimize log file permissions
optimize_log_permissions() {
    log "Optimizing log file permissions..."
    
    # Set proper permissions for log files
    find "$LOGS_DIR" -name "*.log" -type f -exec chmod 644 {} \; 2>/dev/null || true
    find "$LOGS_DIR" -name "*.gz" -type f -exec chmod 644 {} \; 2>/dev/null || true
    find "$LOGS_DIR" -type d -exec chmod 755 {} \; 2>/dev/null || true
    
    # Set ownership if running as root
    if [[ "$USER" == "root" ]] && id "titan" &>/dev/null; then
        chown -R titan:titan "$LOGS_DIR" 2>/dev/null || true
        log "Set ownership to titan:titan"
    fi
    
    success "Log file permissions optimized"
}

# Generate maintenance report
generate_maintenance_report() {
    log "Generating maintenance report..."
    
    local report_file="$LOGS_DIR/maintenance_report_$(date +%Y%m%d_%H%M%S).txt"
    
    cat > "$report_file" << EOF
Titan Log Maintenance Report
Generated: $(date)
Maintenance Mode: $MAINTENANCE_MODE

=== Disk Usage ===
$(df -h "$PROJECT_ROOT")

=== Log Directory Summary ===
Total log files: $(find "$LOGS_DIR" -name "*.log" -type f | wc -l)
Compressed logs: $(find "$LOGS_DIR" -name "*.gz" -type f | wc -l)
Archived logs: $(find "$LOGS_DIR/archive" -name "*.gz" -type f 2>/dev/null | wc -l)

=== Log File Sizes ===
$(find "$LOGS_DIR" -name "*.log" -type f -exec ls -lh {} \; | awk '{print $5, $9}' | sort -hr | head -10)

=== Recent Activity ===
Active log files (modified in last hour):
$(find "$LOGS_DIR" -name "*.log" -type f -mmin -60 -exec ls -lh {} \; 2>/dev/null | awk '{print $5, $6, $7, $8, $9}')

=== Configuration ===
Max log size: $MAX_LOG_SIZE
Max log age: $MAX_LOG_AGE_DAYS days
Compressed log age: $COMPRESSED_LOG_AGE_DAYS days
Backup log age: $BACKUP_LOG_AGE_DAYS days
Compression level: $COMPRESSION_LEVEL

=== Maintenance Actions Performed ===
- Log rotation for files > $MAX_LOG_SIZE
- Compression of logs older than 1 day
- Archival of compressed logs older than $MAX_LOG_AGE_DAYS days
- Cleanup of logs older than $COMPRESSED_LOG_AGE_DAYS days
- Permission optimization
- Empty directory cleanup

EOF
    
    success "Maintenance report generated: $report_file"
}

# Setup logrotate configuration
setup_logrotate() {
    log "Setting up logrotate configuration..."
    
    local logrotate_config="/etc/logrotate.d/titan-trading"
    
    # Create logrotate configuration
    sudo tee "$logrotate_config" > /dev/null << EOF
# Titan Trading System Log Rotation Configuration

$LOGS_DIR/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 titan titan
    postrotate
        # Reload PM2 processes to reopen log files
        if [ -f /usr/bin/pm2 ]; then
            su titan -c "pm2 reloadLogs" >/dev/null 2>&1 || true
        fi
    endscript
}

# System logs
/var/log/titan/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 titan titan
    copytruncate
}

# PM2 logs
/home/titan/.pm2/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 titan titan
    postrotate
        su titan -c "pm2 reloadLogs" >/dev/null 2>&1 || true
    endscript
}
EOF
    
    # Test logrotate configuration
    if sudo logrotate -d "$logrotate_config" &> /dev/null; then
        success "Logrotate configuration created and tested"
    else
        error "Logrotate configuration test failed"
        return 1
    fi
}

# Create cron job for automatic maintenance
setup_cron_job() {
    log "Setting up cron job for automatic maintenance..."
    
    local cron_script="$SCRIPT_DIR/maintain-titan-logs.sh"
    local cron_entry="0 2 * * * $cron_script --mode auto >> $LOGS_DIR/maintenance.log 2>&1"
    
    # Add cron job if it doesn't exist
    if ! crontab -l 2>/dev/null | grep -q "$cron_script"; then
        (crontab -l 2>/dev/null; echo "$cron_entry") | crontab -
        success "Cron job added for daily log maintenance at 2:00 AM"
    else
        log "Cron job already exists"
    fi
}

# Main maintenance function
perform_maintenance() {
    log "Starting Titan log maintenance..."
    
    # Check disk space first
    local disk_status
    check_disk_space
    disk_status=$?
    
    if [[ $disk_status -eq 2 ]]; then
        warning "Critical disk space - performing aggressive cleanup"
        MAX_LOG_AGE_DAYS=7
        COMPRESSED_LOG_AGE_DAYS=30
    elif [[ $disk_status -eq 1 ]]; then
        warning "High disk usage - performing enhanced cleanup"
        MAX_LOG_AGE_DAYS=14
        COMPRESSED_LOG_AGE_DAYS=60
    fi
    
    # Create maintenance directories
    create_maintenance_directories
    
    # Perform maintenance operations
    rotate_large_logs
    compress_old_logs
    archive_old_logs
    cleanup_old_logs
    cleanup_empty_directories
    optimize_log_permissions
    
    # Generate report
    generate_maintenance_report
    
    # Check disk space after maintenance
    log "Post-maintenance disk space check:"
    check_disk_space
    
    success "Log maintenance completed successfully!"
}

# Emergency cleanup for critical disk space
emergency_cleanup() {
    warning "Performing emergency cleanup due to critical disk space..."
    
    # Aggressive cleanup parameters
    MAX_LOG_AGE_DAYS=1
    COMPRESSED_LOG_AGE_DAYS=7
    BACKUP_LOG_AGE_DAYS=30
    
    # Stop non-essential services temporarily
    local stopped_services=()
    local non_essential_services=("titan-ai-quant")
    
    for service in "${non_essential_services[@]}"; do
        if pm2 describe "$service" &> /dev/null; then
            pm2 stop "$service" --silent
            stopped_services+=("$service")
            log "Temporarily stopped: $service"
        fi
    done
    
    # Perform aggressive maintenance
    perform_maintenance
    
    # Restart stopped services
    for service in "${stopped_services[@]}"; do
        pm2 start "$service" --silent
        log "Restarted: $service"
    done
    
    success "Emergency cleanup completed"
}

# Display maintenance status
show_status() {
    log "Titan Log Maintenance Status"
    echo ""
    
    # Disk usage
    log "Disk Usage:"
    df -h "$PROJECT_ROOT" | grep -v Filesystem
    echo ""
    
    # Log file counts
    log "Log File Summary:"
    local active_logs=$(find "$LOGS_DIR" -name "*.log" -type f | wc -l)
    local compressed_logs=$(find "$LOGS_DIR" -name "*.gz" -type f | wc -l)
    local archived_logs=$(find "$LOGS_DIR/archive" -name "*.gz" -type f 2>/dev/null | wc -l)
    
    echo "  Active log files: $active_logs"
    echo "  Compressed logs: $compressed_logs"
    echo "  Archived logs: $archived_logs"
    echo ""
    
    # Largest log files
    log "Largest Log Files:"
    find "$LOGS_DIR" -name "*.log" -type f -exec ls -lh {} \; | awk '{print $5, $9}' | sort -hr | head -5
    echo ""
    
    # Recent maintenance
    log "Recent Maintenance Reports:"
    find "$LOGS_DIR" -name "maintenance_report_*.txt" -type f -mtime -7 -exec ls -lh {} \; | tail -3
}

# Display usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
    --mode MODE           Maintenance mode: auto, manual, emergency (default: manual)
    --max-size SIZE       Maximum log file size before rotation (default: 10M)
    --max-age DAYS        Maximum age for uncompressed logs (default: 30)
    --compressed-age DAYS Maximum age for compressed logs (default: 90)
    --setup-cron          Setup automatic cron job for maintenance
    --setup-logrotate     Setup system logrotate configuration
    --status              Show current maintenance status
    --emergency           Perform emergency cleanup for critical disk space
    -h, --help           Show this help message

Examples:
    $0                                    # Manual maintenance
    $0 --mode auto                       # Automatic maintenance (for cron)
    $0 --emergency                       # Emergency cleanup
    $0 --setup-cron                      # Setup daily cron job
    $0 --status                          # Show maintenance status

This script will:
1. Check disk space usage
2. Rotate large log files (> max-size)
3. Compress old log files (> 1 day old)
4. Archive compressed logs (> max-age days)
5. Clean up very old logs (> compressed-age days)
6. Optimize file permissions
7. Generate maintenance report

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
            --max-size)
                MAX_LOG_SIZE="$2"
                shift 2
                ;;
            --max-age)
                MAX_LOG_AGE_DAYS="$2"
                shift 2
                ;;
            --compressed-age)
                COMPRESSED_LOG_AGE_DAYS="$2"
                shift 2
                ;;
            --setup-cron)
                setup_cron_job
                exit 0
                ;;
            --setup-logrotate)
                setup_logrotate
                exit 0
                ;;
            --status)
                show_status
                exit 0
                ;;
            --emergency)
                emergency_cleanup
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
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         TITAN LOG MAINTENANCE                               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

parse_args "$@"

# Validate maintenance mode
if [[ ! "$MAINTENANCE_MODE" =~ ^(auto|manual|emergency)$ ]]; then
    error "Invalid maintenance mode: $MAINTENANCE_MODE"
    usage
    exit 1
fi

# Perform maintenance
case "$MAINTENANCE_MODE" in
    emergency)
        emergency_cleanup
        ;;
    *)
        perform_maintenance
        ;;
esac