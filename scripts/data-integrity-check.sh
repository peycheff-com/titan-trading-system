#!/bin/bash

# Data Integrity Verification Script for Titan Trading System
# Requirements: 7.5 - Add data integrity verification and corruption detection

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
LOG_DIR="${LOG_DIR:-./logs}"
INTEGRITY_LOG="$LOG_DIR/data-integrity-check.log"
REPORT_DIR="integrity-reports"
CHECK_TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Integrity check types
CHECK_TYPES=(
    "database_integrity"
    "file_checksums"
    "configuration_validation"
    "backup_verification"
    "log_consistency"
)

echo -e "${PURPLE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║         TITAN DATA INTEGRITY VERIFICATION                  ║${NC}"
echo -e "${PURPLE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Ensure directories exist
mkdir -p "$LOG_DIR" "$REPORT_DIR"

# Logging function
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "[$timestamp] [$level] $message" | tee -a "$INTEGRITY_LOG"
}

# Function to calculate file checksum
calculate_checksum() {
    local file_path=$1
    local algorithm=${2:-sha256}
    
    if [ -f "$file_path" ]; then
        case "$algorithm" in
            "md5")
                md5sum "$file_path" 2>/dev/null | cut -d' ' -f1
                ;;
            "sha1")
                sha1sum "$file_path" 2>/dev/null | cut -d' ' -f1
                ;;
            "sha256")
                sha256sum "$file_path" 2>/dev/null | cut -d' ' -f1
                ;;
            *)
                echo "unknown"
                ;;
        esac
    else
        echo "file_not_found"
    fi
}

# Function to check database integrity
check_database_integrity() {
    log "INFO" "Checking database integrity"
    
    local integrity_errors=0
    local databases_checked=0
    local integrity_details=""
    
    # Check SQLite databases
    find services -name "*.db" -type f | while read db_file; do
        databases_checked=$((databases_checked + 1))
        local db_name=$(basename "$db_file")
        local service_name=$(basename "$(dirname "$db_file")")
        
        log "INFO" "Checking SQLite database: $db_name in $service_name"
        
        # Basic integrity check
        local integrity_result=$(sqlite3 "$db_file" "PRAGMA integrity_check;" 2>/dev/null || echo "error")
        
        if [ "$integrity_result" = "ok" ]; then
            log "INFO" "Database integrity OK: $db_name"
            integrity_details="${integrity_details}✅ $service_name/$db_name: OK\n"
        else
            log "ERROR" "Database integrity FAILED: $db_name - $integrity_result"
            integrity_details="${integrity_details}❌ $service_name/$db_name: $integrity_result\n"
            integrity_errors=$((integrity_errors + 1))
        fi
        
        # Additional checks
        local table_count=$(sqlite3 "$db_file" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "0")
        local record_count=$(sqlite3 "$db_file" "SELECT SUM(count) FROM (SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%');" 2>/dev/null || echo "0")
        
        log "INFO" "Database $db_name: $table_count tables, estimated $record_count records"
        
        # Check for foreign key violations
        local fk_violations=$(sqlite3 "$db_file" "PRAGMA foreign_key_check;" 2>/dev/null | wc -l)
        if [ "$fk_violations" -gt 0 ]; then
            log "WARN" "Database $db_name has $fk_violations foreign key violations"
            integrity_details="${integrity_details}⚠️  $service_name/$db_name: $fk_violations FK violations\n"
        fi
        
        # Check database file size and last modified
        local db_size=$(stat -f%z "$db_file" 2>/dev/null || stat -c%s "$db_file" 2>/dev/null || echo "0")
        local db_modified=$(stat -f%m "$db_file" 2>/dev/null || stat -c%Y "$db_file" 2>/dev/null || echo "0")
        local db_age=$(($(date +%s) - db_modified))
        
        log "INFO" "Database $db_name: size $(echo $db_size | numfmt --to=iec), last modified ${db_age}s ago"
    done
    
    # Check PostgreSQL databases (if available)
    if command -v psql >/dev/null 2>&1; then
        local db_name="${DB_NAME:-titan_brain}"
        local db_host="${DB_HOST:-localhost}"
        local db_port="${DB_PORT:-5432}"
        local db_user="${DB_USER:-titan}"
        
        if PGPASSWORD="$DB_PASSWORD" psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -c "SELECT 1;" >/dev/null 2>&1; then
            databases_checked=$((databases_checked + 1))
            log "INFO" "Checking PostgreSQL database: $db_name"
            
            # Check database connectivity and basic integrity
            local pg_tables=$(PGPASSWORD="$DB_PASSWORD" psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
            
            if [ -n "$pg_tables" ] && [ "$pg_tables" -gt 0 ]; then
                log "INFO" "PostgreSQL database OK: $pg_tables tables found"
                integrity_details="${integrity_details}✅ PostgreSQL/$db_name: $pg_tables tables\n"
            else
                log "ERROR" "PostgreSQL database integrity check failed"
                integrity_details="${integrity_details}❌ PostgreSQL/$db_name: No tables found\n"
                integrity_errors=$((integrity_errors + 1))
            fi
        else
            log "WARN" "Cannot connect to PostgreSQL database for integrity check"
        fi
    fi
    
    echo "$integrity_errors:$databases_checked:$integrity_details"
}

# Function to verify file checksums
check_file_checksums() {
    log "INFO" "Checking file checksums and detecting corruption"
    
    local checksum_errors=0
    local files_checked=0
    local checksum_details=""
    
    # Create or load checksum database
    local checksum_file="$REPORT_DIR/file-checksums.db"
    local previous_checksums_exist=false
    
    if [ -f "$checksum_file" ]; then
        previous_checksums_exist=true
        log "INFO" "Loading previous checksums from $checksum_file"
    else
        log "INFO" "Creating new checksum database: $checksum_file"
        echo "# Titan File Checksums - Created $(date)" > "$checksum_file"
        echo "# Format: filepath:algorithm:checksum:timestamp" >> "$checksum_file"
    fi
    
    # Files to check
    local critical_files=(
        "start-titan.sh"
        "stop-titan.sh"
        "ecosystem.config.js"
    )
    
    # Add service files
    find services -name "package.json" -o -name "*.config.js" -o -name "*.env.example" | while read file; do
        critical_files+=("$file")
    done
    
    # Check each critical file
    for file_path in "${critical_files[@]}"; do
        if [ -f "$file_path" ]; then
            files_checked=$((files_checked + 1))
            local current_checksum=$(calculate_checksum "$file_path" "sha256")
            local file_timestamp=$(stat -f%m "$file_path" 2>/dev/null || stat -c%Y "$file_path" 2>/dev/null || echo "0")
            
            if [ "$previous_checksums_exist" = "true" ]; then
                # Compare with previous checksum
                local previous_entry=$(grep "^$file_path:" "$checksum_file" | tail -1)
                
                if [ -n "$previous_entry" ]; then
                    local previous_checksum=$(echo "$previous_entry" | cut -d':' -f3)
                    
                    if [ "$current_checksum" = "$previous_checksum" ]; then
                        log "INFO" "File checksum OK: $file_path"
                        checksum_details="${checksum_details}✅ $file_path: unchanged\n"
                    else
                        log "WARN" "File checksum CHANGED: $file_path"
                        checksum_details="${checksum_details}⚠️  $file_path: checksum changed\n"
                        # Note: This might be expected for legitimate updates
                    fi
                else
                    log "INFO" "New file detected: $file_path"
                    checksum_details="${checksum_details}🆕 $file_path: new file\n"
                fi
            else
                log "INFO" "Recording checksum for: $file_path"
                checksum_details="${checksum_details}📝 $file_path: recorded\n"
            fi
            
            # Update checksum database
            echo "$file_path:sha256:$current_checksum:$file_timestamp" >> "$checksum_file"
        fi
    done
    
    # Check for deleted files
    if [ "$previous_checksums_exist" = "true" ]; then
        while IFS=':' read -r file_path algorithm checksum timestamp; do
            if [[ "$file_path" =~ ^#.* ]]; then
                continue  # Skip comments
            fi
            
            if [ ! -f "$file_path" ]; then
                log "WARN" "File deleted: $file_path"
                checksum_details="${checksum_details}🗑️  $file_path: deleted\n"
            fi
        done < "$checksum_file"
    fi
    
    echo "$checksum_errors:$files_checked:$checksum_details"
}

# Function to validate configuration files
check_configuration_validation() {
    log "INFO" "Validating configuration files"
    
    local config_errors=0
    local configs_checked=0
    local config_details=""
    
    # Check JSON configuration files
    find services -name "*.json" -type f | while read json_file; do
        configs_checked=$((configs_checked + 1))
        local file_name=$(basename "$json_file")
        local service_name=$(basename "$(dirname "$json_file")")
        
        log "INFO" "Validating JSON: $service_name/$file_name"
        
        if python3 -m json.tool "$json_file" >/dev/null 2>&1; then
            log "INFO" "JSON valid: $service_name/$file_name"
            config_details="${config_details}✅ $service_name/$file_name: valid JSON\n"
        else
            log "ERROR" "JSON invalid: $service_name/$file_name"
            config_details="${config_details}❌ $service_name/$file_name: invalid JSON\n"
            config_errors=$((config_errors + 1))
        fi
    done
    
    # Check environment files
    find services -name ".env*" -type f | while read env_file; do
        configs_checked=$((configs_checked + 1))
        local file_name=$(basename "$env_file")
        local service_name=$(basename "$(dirname "$env_file")")
        
        log "INFO" "Validating ENV: $service_name/$file_name"
        
        # Basic validation - check for required format
        local invalid_lines=$(grep -v '^#' "$env_file" | grep -v '^$' | grep -v '^[A-Z_][A-Z0-9_]*=' | wc -l)
        
        if [ "$invalid_lines" -eq 0 ]; then
            log "INFO" "ENV valid: $service_name/$file_name"
            config_details="${config_details}✅ $service_name/$file_name: valid format\n"
        else
            log "WARN" "ENV format issues: $service_name/$file_name ($invalid_lines invalid lines)"
            config_details="${config_details}⚠️  $service_name/$file_name: $invalid_lines format issues\n"
        fi
        
        # Check for sensitive data exposure
        local sensitive_patterns=("password" "secret" "key" "token")
        for pattern in "${sensitive_patterns[@]}"; do
            if grep -i "$pattern" "$env_file" | grep -v "example" | grep -v "#" >/dev/null 2>&1; then
                log "WARN" "Potential sensitive data in: $service_name/$file_name"
                config_details="${config_details}🔒 $service_name/$file_name: contains sensitive data\n"
                break
            fi
        done
    done
    
    echo "$config_errors:$configs_checked:$config_details"
}

# Function to verify backup integrity
check_backup_verification() {
    log "INFO" "Verifying backup file integrity"
    
    local backup_errors=0
    local backups_checked=0
    local backup_details=""
    local backup_dir="${BACKUP_DIR:-./backups}"
    
    if [ ! -d "$backup_dir" ]; then
        log "WARN" "Backup directory not found: $backup_dir"
        echo "1:0:No backup directory found"
        return
    fi
    
    # Check compressed backup files
    find "$backup_dir" -name "*.gz" -type f -mtime -7 | while read backup_file; do
        backups_checked=$((backups_checked + 1))
        local backup_name=$(basename "$backup_file")
        
        log "INFO" "Verifying backup: $backup_name"
        
        # Test gzip integrity
        if gzip -t "$backup_file" 2>/dev/null; then
            log "INFO" "Backup compression OK: $backup_name"
            
            # Additional verification based on backup type
            if echo "$backup_name" | grep -q "_database_"; then
                # For database backups, try to extract and verify
                local temp_file=$(mktemp)
                if gunzip -c "$backup_file" > "$temp_file" 2>/dev/null; then
                    if echo "$backup_name" | grep -q "titan-execution"; then
                        # SQLite verification
                        if sqlite3 "$temp_file" "PRAGMA integrity_check;" | grep -q "ok" 2>/dev/null; then
                            log "INFO" "Database backup integrity OK: $backup_name"
                            backup_details="${backup_details}✅ $backup_name: database integrity OK\n"
                        else
                            log "ERROR" "Database backup integrity FAILED: $backup_name"
                            backup_details="${backup_details}❌ $backup_name: database integrity failed\n"
                            backup_errors=$((backup_errors + 1))
                        fi
                    elif echo "$backup_name" | grep -q "titan-brain"; then
                        # PostgreSQL dump verification
                        if grep -q "PostgreSQL database dump" "$temp_file" 2>/dev/null; then
                            log "INFO" "PostgreSQL backup format OK: $backup_name"
                            backup_details="${backup_details}✅ $backup_name: PostgreSQL format OK\n"
                        else
                            log "ERROR" "PostgreSQL backup format FAILED: $backup_name"
                            backup_details="${backup_details}❌ $backup_name: PostgreSQL format failed\n"
                            backup_errors=$((backup_errors + 1))
                        fi
                    fi
                else
                    log "ERROR" "Failed to extract backup: $backup_name"
                    backup_details="${backup_details}❌ $backup_name: extraction failed\n"
                    backup_errors=$((backup_errors + 1))
                fi
                rm -f "$temp_file"
            else
                # For other backups, just verify compression
                backup_details="${backup_details}✅ $backup_name: compression OK\n"
            fi
        else
            log "ERROR" "Backup compression FAILED: $backup_name"
            backup_details="${backup_details}❌ $backup_name: compression failed\n"
            backup_errors=$((backup_errors + 1))
        fi
        
        # Check backup age and size
        local backup_age=$(find "$backup_file" -mtime +30 | wc -l)
        if [ "$backup_age" -gt 0 ]; then
            log "WARN" "Old backup detected: $backup_name (>30 days)"
            backup_details="${backup_details}⏰ $backup_name: >30 days old\n"
        fi
        
        local backup_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null || echo "0")
        if [ "$backup_size" -lt 1024 ]; then
            log "WARN" "Suspiciously small backup: $backup_name (${backup_size} bytes)"
            backup_details="${backup_details}⚠️  $backup_name: very small (${backup_size}B)\n"
        fi
    done
    
    echo "$backup_errors:$backups_checked:$backup_details"
}

# Function to check log consistency
check_log_consistency() {
    log "INFO" "Checking log file consistency"
    
    local log_errors=0
    local logs_checked=0
    local log_details=""
    
    # Check log files
    find logs -name "*.log" -type f 2>/dev/null | while read log_file; do
        logs_checked=$((logs_checked + 1))
        local log_name=$(basename "$log_file")
        
        log "INFO" "Checking log: $log_name"
        
        # Check if log file is readable
        if [ -r "$log_file" ]; then
            local log_size=$(stat -f%z "$log_file" 2>/dev/null || stat -c%s "$log_file" 2>/dev/null || echo "0")
            local log_lines=$(wc -l < "$log_file" 2>/dev/null || echo "0")
            
            log "INFO" "Log $log_name: $log_lines lines, $(echo $log_size | numfmt --to=iec)"
            
            # Check for recent activity (logs should have recent entries)
            local recent_entries=$(tail -100 "$log_file" | grep "$(date +%Y-%m-%d)" | wc -l)
            if [ "$recent_entries" -gt 0 ]; then
                log "INFO" "Log has recent activity: $log_name ($recent_entries entries today)"
                log_details="${log_details}✅ $log_name: recent activity ($recent_entries entries)\n"
            else
                log "WARN" "Log has no recent activity: $log_name"
                log_details="${log_details}⚠️  $log_name: no recent activity\n"
            fi
            
            # Check for error patterns
            local error_count=$(grep -i "error\|exception\|failed\|fatal" "$log_file" | wc -l)
            if [ "$error_count" -gt 0 ]; then
                log "INFO" "Log contains $error_count error entries: $log_name"
                log_details="${log_details}⚠️  $log_name: $error_count errors found\n"
            fi
            
            # Check log rotation (files shouldn't be too large)
            if [ "$log_size" -gt 104857600 ]; then  # 100MB
                log "WARN" "Large log file detected: $log_name ($(echo $log_size | numfmt --to=iec))"
                log_details="${log_details}📏 $log_name: large file ($(echo $log_size | numfmt --to=iec))\n"
            fi
        else
            log "ERROR" "Cannot read log file: $log_name"
            log_details="${log_details}❌ $log_name: unreadable\n"
            log_errors=$((log_errors + 1))
        fi
    done
    
    echo "$log_errors:$logs_checked:$log_details"
}

# Function to run all integrity checks
run_all_checks() {
    log "INFO" "Starting comprehensive data integrity verification"
    
    local total_checks=0
    local total_errors=0
    local check_results=()
    
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Data Integrity Verification Report${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Run each check type
    for check_type in "${CHECK_TYPES[@]}"; do
        echo -e "\n${CYAN}Checking: $check_type${NC}"
        
        local result=""
        case "$check_type" in
            "database_integrity")
                result=$(check_database_integrity)
                ;;
            "file_checksums")
                result=$(check_file_checksums)
                ;;
            "configuration_validation")
                result=$(check_configuration_validation)
                ;;
            "backup_verification")
                result=$(check_backup_verification)
                ;;
            "log_consistency")
                result=$(check_log_consistency)
                ;;
        esac
        
        local errors=$(echo "$result" | cut -d':' -f1)
        local checked=$(echo "$result" | cut -d':' -f2)
        local details=$(echo "$result" | cut -d':' -f3-)
        
        total_checks=$((total_checks + checked))
        total_errors=$((total_errors + errors))
        
        if [ "$errors" -eq 0 ]; then
            echo -e "${GREEN}✅ $check_type: $checked items checked, no errors${NC}"
        else
            echo -e "${RED}❌ $check_type: $errors errors in $checked items${NC}"
        fi
        
        if [ -n "$details" ]; then
            echo -e "$details"
        fi
        
        check_results+=("$check_type:$errors:$checked:$details")
    done
    
    # Generate final report
    echo -e "\n${PURPLE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║         DATA INTEGRITY SUMMARY                             ║${NC}"
    echo -e "${PURPLE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Overall Status:${NC}"
    echo -e "   Total Items Checked: $total_checks"
    echo -e "   Total Errors Found: ${RED}$total_errors${NC}"
    
    if [ "$total_errors" -eq 0 ]; then
        echo -e "   Status: ${GREEN}✅ ALL CHECKS PASSED${NC}"
    else
        echo -e "   Status: ${RED}❌ ERRORS DETECTED${NC}"
    fi
    
    # Save detailed report
    local report_file="$REPORT_DIR/integrity-report-$CHECK_TIMESTAMP.json"
    cat > "$report_file" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "check_id": "$CHECK_TIMESTAMP",
  "summary": {
    "total_checks": $total_checks,
    "total_errors": $total_errors,
    "success_rate": $(echo "scale=2; ($total_checks - $total_errors) * 100 / $total_checks" | bc -l 2>/dev/null || echo "0")
  },
  "results": [
$(for result in "${check_results[@]}"; do
    IFS=':' read -r check_type errors checked details <<< "$result"
    echo "    {\"check_type\": \"$check_type\", \"errors\": $errors, \"checked\": $checked, \"details\": \"$(echo "$details" | sed 's/"/\\"/g')\"}"
done | sed '$!s/$/,/')
  ]
}
EOF
    
    log "INFO" "Data integrity report saved: $report_file"
    
    # Return appropriate exit code
    if [ "$total_errors" -eq 0 ]; then
        echo -e "\n${GREEN}🎉 All data integrity checks passed!${NC}"
        return 0
    else
        echo -e "\n${RED}💥 Data integrity issues detected!${NC}"
        echo -e "${YELLOW}   Review the detailed report: $report_file${NC}"
        return 1
    fi
}

# Main execution
case "${1:-}" in
    --check)
        if [ -n "$2" ]; then
            case "$2" in
                "database_integrity"|"file_checksums"|"configuration_validation"|"backup_verification"|"log_consistency")
                    echo -e "${CYAN}Running specific check: $2${NC}"
                    case "$2" in
                        "database_integrity")
                            check_database_integrity
                            ;;
                        "file_checksums")
                            check_file_checksums
                            ;;
                        "configuration_validation")
                            check_configuration_validation
                            ;;
                        "backup_verification")
                            check_backup_verification
                            ;;
                        "log_consistency")
                            check_log_consistency
                            ;;
                    esac
                    ;;
                *)
                    echo "Unknown check type: $2"
                    exit 1
                    ;;
            esac
        else
            echo "Please specify a check type"
            exit 1
        fi
        ;;
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo "Options:"
        echo "  --check TYPE    Run specific integrity check"
        echo "  --help          Show this help"
        echo ""
        echo "Available check types:"
        for check_type in "${CHECK_TYPES[@]}"; do
            echo "  - $check_type"
        done
        exit 0
        ;;
    *)
        run_all_checks
        exit $?
        ;;
esac