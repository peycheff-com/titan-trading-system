#!/bin/bash

# Titan System Maintenance Script
# This script performs comprehensive system maintenance for the Titan Trading System
# Requirements: 9.4, 4.2, 1.5 - System maintenance, security updates, and log management

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOGS_DIR="$PROJECT_ROOT/logs"
CONFIG_DIR="$PROJECT_ROOT/config"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Maintenance configuration
MAINTENANCE_MODE="manual"
MAINTENANCE_TASKS="all"
SKIP_SERVICES_RESTART=false
MAINTENANCE_WINDOW_HOURS=2

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

maintenance_log() {
    local message="$1"
    local log_file="$LOGS_DIR/maintenance.log"
    local timestamp=$(date -Iseconds)
    
    echo "[$timestamp] MAINTENANCE: $message" >> "$log_file"
    log "$message"
}

# Check if maintenance window is appropriate
check_maintenance_window() {
    local current_hour=$(date +%H)
    local current_day=$(date +%u)  # 1=Monday, 7=Sunday
    
    # Recommended maintenance windows:
    # - Weekdays: 2-4 AM
    # - Weekends: 1-5 AM
    
    local window_start=2
    local window_end=4
    
    if [[ $current_day -eq 6 ]] || [[ $current_day -eq 7 ]]; then
        # Weekend - extended window
        window_start=1
        window_end=5
    fi
    
    if [[ $current_hour -ge $window_start ]] && [[ $current_hour -lt $window_end ]]; then
        success "Maintenance window is appropriate (${current_hour}:00)"
        return 0
    else
        warning "Outside recommended maintenance window (${window_start}:00-${window_end}:00)"
        
        if [[ "$MAINTENANCE_MODE" == "auto" ]]; then
            log "Skipping maintenance outside of window"
            return 1
        else
            warning "Proceeding with manual maintenance"
            return 0
        fi
    fi
}

# Pre-maintenance system check
pre_maintenance_check() {
    log "Performing pre-maintenance system check..."
    
    local check_errors=0
    
    # Check system load
    local load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    local cpu_cores=$(nproc)
    local load_threshold=$(echo "$cpu_cores * 2" | bc -l 2>/dev/null || echo $((cpu_cores * 2)))
    
    if (( $(echo "$load_avg > $load_threshold" | bc -l 2>/dev/null || echo 0) )); then
        error "High system load: $load_avg (threshold: $load_threshold)"
        ((check_errors++))
    else
        success "System load OK: $load_avg"
    fi
    
    # Check disk space
    local disk_usage=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $5}' | sed 's/%//')
    if [[ $disk_usage -gt 95 ]]; then
        error "Critical disk space: ${disk_usage}% used"
        ((check_errors++))
    elif [[ $disk_usage -gt 85 ]]; then
        warning "High disk usage: ${disk_usage}% used"
    else
        success "Disk space OK: ${disk_usage}% used"
    fi
    
    # Check memory usage
    local mem_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    if [[ $mem_usage -gt 90 ]]; then
        warning "High memory usage: ${mem_usage}%"
    else
        success "Memory usage OK: ${mem_usage}%"
    fi
    
    # Check critical services
    local critical_services=("redis-server" "nginx")
    for service in "${critical_services[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            success "Critical service running: $service"
        else
            error "Critical service not running: $service"
            ((check_errors++))
        fi
    done
    
    # Check PM2 processes
    local pm2_processes=$(pm2 jlist 2>/dev/null | jq length 2>/dev/null || echo 0)
    if [[ $pm2_processes -gt 0 ]]; then
        success "PM2 processes running: $pm2_processes"
    else
        warning "No PM2 processes running"
    fi
    
    if [[ $check_errors -gt 0 ]]; then
        error "Pre-maintenance check failed with $check_errors error(s)"
        
        if [[ "$MAINTENANCE_MODE" == "auto" ]]; then
            error "Aborting automatic maintenance due to system issues"
            return 1
        else
            warning "Proceeding with manual maintenance despite issues"
            return 0
        fi
    else
        success "Pre-maintenance check passed"
        return 0
    fi
}

# Create maintenance snapshot
create_maintenance_snapshot() {
    log "Creating maintenance snapshot..."
    
    local snapshot_dir="$PROJECT_ROOT/backups/maintenance/snapshot_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$snapshot_dir"
    
    # Capture system state
    cat > "$snapshot_dir/system_state.txt" << EOF
Maintenance Snapshot
Generated: $(date)
Hostname: $(hostname)
Uptime: $(uptime)

=== System Information ===
$(uname -a)

=== Disk Usage ===
$(df -h)

=== Memory Usage ===
$(free -h)

=== Load Average ===
$(uptime)

=== Network Connections ===
$(netstat -tuln | grep -E ":(3000|3001|3002|3003|3004|3005|3006|6379|5432)")

=== PM2 Processes ===
$(pm2 jlist 2>/dev/null || echo "PM2 not available")

=== System Services ===
$(systemctl list-units --type=service --state=running | grep -E "(titan|redis|nginx|fail2ban)")

=== Recent Logs ===
$(tail -20 "$LOGS_DIR"/*.log 2>/dev/null | head -100)
EOF
    
    # Backup critical configuration
    if [[ -d "$CONFIG_DIR" ]]; then
        cp -r "$CONFIG_DIR" "$snapshot_dir/"
    fi
    
    # Backup PM2 ecosystem
    if [[ -f "$PROJECT_ROOT/ecosystem.config.js" ]]; then
        cp "$PROJECT_ROOT/ecosystem.config.js" "$snapshot_dir/"
    fi
    
    maintenance_log "Maintenance snapshot created: $snapshot_dir"
    success "Maintenance snapshot created"
    
    echo "$snapshot_dir" > "$PROJECT_ROOT/tmp/last_maintenance_snapshot.txt"
}

# Perform log maintenance
perform_log_maintenance() {
    if [[ "$MAINTENANCE_TASKS" != "all" ]] && [[ "$MAINTENANCE_TASKS" != "logs" ]]; then
        return 0
    fi
    
    log "Performing log maintenance..."
    
    if [[ -x "$SCRIPT_DIR/maintain-titan-logs.sh" ]]; then
        "$SCRIPT_DIR/maintain-titan-logs.sh" --mode auto
        maintenance_log "Log maintenance completed"
    else
        error "Log maintenance script not found or not executable"
    fi
}

# Perform security maintenance
perform_security_maintenance() {
    if [[ "$MAINTENANCE_TASKS" != "all" ]] && [[ "$MAINTENANCE_TASKS" != "security" ]]; then
        return 0
    fi
    
    log "Performing security maintenance..."
    
    if [[ -x "$SCRIPT_DIR/maintain-titan-security.sh" ]]; then
        "$SCRIPT_DIR/maintain-titan-security.sh" --mode auto
        maintenance_log "Security maintenance completed"
    else
        error "Security maintenance script not found or not executable"
    fi
}

# Perform database maintenance
perform_database_maintenance() {
    if [[ "$MAINTENANCE_TASKS" != "all" ]] && [[ "$MAINTENANCE_TASKS" != "database" ]]; then
        return 0
    fi
    
    log "Performing database maintenance..."
    
    # Redis maintenance
    if command -v redis-cli &> /dev/null && redis-cli ping &> /dev/null; then
        log "Performing Redis maintenance..."
        
        # Get Redis info
        local redis_memory=$(redis-cli info memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
        local redis_keys=$(redis-cli dbsize)
        
        log "Redis status: $redis_keys keys, $redis_memory memory used"
        
        # Perform BGSAVE for backup
        redis-cli BGSAVE > /dev/null
        log "Redis background save initiated"
        
        # Clean up expired keys
        redis-cli --scan --pattern "titan:temp:*" | xargs -r redis-cli DEL > /dev/null 2>&1 || true
        redis-cli --scan --pattern "titan:cache:*" | while read key; do
            redis-cli TTL "$key" | grep -q "^-1$" && redis-cli DEL "$key" > /dev/null 2>&1 || true
        done
        
        success "Redis maintenance completed"
    else
        warning "Redis not accessible for maintenance"
    fi
    
    # PostgreSQL maintenance (if used)
    if command -v psql &> /dev/null; then
        log "Performing PostgreSQL maintenance..."
        
        local pg_databases=("titan_brain" "titan_execution")
        for db_name in "${pg_databases[@]}"; do
            if psql -lqt | cut -d \| -f 1 | grep -qw "$db_name" 2>/dev/null; then
                log "Maintaining PostgreSQL database: $db_name"
                
                # Vacuum and analyze
                psql -d "$db_name" -c "VACUUM ANALYZE;" 2>/dev/null || true
                
                # Update statistics
                psql -d "$db_name" -c "ANALYZE;" 2>/dev/null || true
                
                success "PostgreSQL maintenance completed for $db_name"
            fi
        done
    fi
    
    maintenance_log "Database maintenance completed"
}

# Perform system optimization
perform_system_optimization() {
    if [[ "$MAINTENANCE_TASKS" != "all" ]] && [[ "$MAINTENANCE_TASKS" != "optimization" ]]; then
        return 0
    fi
    
    log "Performing system optimization..."
    
    # Clear system caches
    if [[ "$USER" == "root" ]]; then
        log "Clearing system caches..."
        sync
        echo 3 > /proc/sys/vm/drop_caches
        success "System caches cleared"
    fi
    
    # Clean package cache
    if command -v apt-get &> /dev/null; then
        log "Cleaning package cache..."
        apt-get clean > /dev/null 2>&1 || true
        apt-get autoremove -y > /dev/null 2>&1 || true
        success "Package cache cleaned"
    fi
    
    # Clean temporary files
    log "Cleaning temporary files..."
    find /tmp -type f -mtime +7 -delete 2>/dev/null || true
    find "$PROJECT_ROOT/tmp" -type f -mtime +7 -delete 2>/dev/null || true
    
    # Optimize log files
    find "$LOGS_DIR" -name "*.log" -size +100M -exec truncate -s 50M {} \; 2>/dev/null || true
    
    # Update locate database
    if command -v updatedb &> /dev/null; then
        updatedb > /dev/null 2>&1 || true
    fi
    
    maintenance_log "System optimization completed"
    success "System optimization completed"
}

# Restart services if needed
restart_services_if_needed() {
    if [[ "$SKIP_SERVICES_RESTART" == "true" ]]; then
        log "Skipping service restart (--no-restart specified)"
        return 0
    fi
    
    log "Checking if service restart is needed..."
    
    local restart_needed=false
    local services_to_restart=()
    
    # Check if system reboot is required
    if [[ -f /var/run/reboot-required ]]; then
        warning "System reboot is required but will not be performed automatically"
        maintenance_log "System reboot required after maintenance"
    fi
    
    # Check if services need restart due to library updates
    if command -v checkrestart &> /dev/null; then
        local outdated_processes=$(checkrestart 2>/dev/null | grep -E "(nginx|redis|pm2)" || true)
        if [[ -n "$outdated_processes" ]]; then
            restart_needed=true
            log "Services need restart due to library updates"
        fi
    fi
    
    # Check PM2 processes health
    local unhealthy_processes=$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.pm2_env.status != "online") | .name' 2>/dev/null || true)
    if [[ -n "$unhealthy_processes" ]]; then
        restart_needed=true
        services_to_restart+=($unhealthy_processes)
        log "Unhealthy PM2 processes detected: $unhealthy_processes"
    fi
    
    if [[ "$restart_needed" == "true" ]]; then
        log "Restarting services..."
        
        # Restart system services
        local system_services=("nginx" "redis-server" "fail2ban")
        for service in "${system_services[@]}"; do
            if systemctl is-active --quiet "$service" 2>/dev/null; then
                log "Restarting system service: $service"
                systemctl restart "$service" 2>/dev/null || true
            fi
        done
        
        # Restart PM2 processes
        if [[ ${#services_to_restart[@]} -gt 0 ]]; then
            for service in "${services_to_restart[@]}"; do
                log "Restarting PM2 process: $service"
                pm2 restart "$service" --silent 2>/dev/null || true
            done
        else
            log "Restarting all PM2 processes..."
            pm2 restart all --silent 2>/dev/null || true
        fi
        
        # Wait for services to stabilize
        sleep 10
        
        # Verify services are running
        local failed_services=()
        for service in "${system_services[@]}"; do
            if ! systemctl is-active --quiet "$service" 2>/dev/null; then
                failed_services+=("$service")
            fi
        done
        
        if [[ ${#failed_services[@]} -gt 0 ]]; then
            error "Failed to restart services: ${failed_services[*]}"
            maintenance_log "Service restart failures: ${failed_services[*]}"
        else
            success "All services restarted successfully"
            maintenance_log "Services restarted successfully"
        fi
    else
        success "No service restart needed"
    fi
}

# Post-maintenance verification
post_maintenance_verification() {
    log "Performing post-maintenance verification..."
    
    local verification_errors=0
    
    # Check system health
    local load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    local cpu_cores=$(nproc)
    local load_threshold=$(echo "$cpu_cores * 1.5" | bc -l 2>/dev/null || echo $((cpu_cores * 3 / 2)))
    
    if (( $(echo "$load_avg > $load_threshold" | bc -l 2>/dev/null || echo 0) )); then
        error "High system load after maintenance: $load_avg"
        ((verification_errors++))
    fi
    
    # Check critical services
    local critical_services=("redis-server" "nginx")
    for service in "${critical_services[@]}"; do
        if ! systemctl is-active --quiet "$service" 2>/dev/null; then
            error "Critical service not running after maintenance: $service"
            ((verification_errors++))
        fi
    done
    
    # Check PM2 processes
    local pm2_online=$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.pm2_env.status == "online") | .name' 2>/dev/null | wc -l)
    local pm2_total=$(pm2 jlist 2>/dev/null | jq length 2>/dev/null || echo 0)
    
    if [[ $pm2_total -gt 0 ]] && [[ $pm2_online -lt $pm2_total ]]; then
        warning "Some PM2 processes are not online: $pm2_online/$pm2_total"
    fi
    
    # Check disk space (should be improved after maintenance)
    local disk_usage=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $5}' | sed 's/%//')
    if [[ $disk_usage -gt 90 ]]; then
        warning "Disk usage still high after maintenance: ${disk_usage}%"
    fi
    
    # Test basic connectivity
    if ! redis-cli ping &> /dev/null; then
        error "Redis connectivity test failed"
        ((verification_errors++))
    fi
    
    if [[ $verification_errors -eq 0 ]]; then
        success "Post-maintenance verification passed"
        maintenance_log "Post-maintenance verification successful"
        return 0
    else
        error "Post-maintenance verification failed with $verification_errors error(s)"
        maintenance_log "Post-maintenance verification failed: $verification_errors errors"
        return 1
    fi
}

# Generate maintenance report
generate_maintenance_report() {
    log "Generating maintenance report..."
    
    local report_file="$LOGS_DIR/maintenance_report_$(date +%Y%m%d_%H%M%S).txt"
    local maintenance_start_time=$(cat "$PROJECT_ROOT/tmp/maintenance_start_time.txt" 2>/dev/null || date -Iseconds)
    local maintenance_end_time=$(date -Iseconds)
    local maintenance_duration=$(( $(date +%s) - $(date -d "$maintenance_start_time" +%s 2>/dev/null || date +%s) ))
    
    cat > "$report_file" << EOF
Titan System Maintenance Report
Generated: $(date)
Maintenance Mode: $MAINTENANCE_MODE
Tasks Performed: $MAINTENANCE_TASKS

=== Maintenance Summary ===
Start Time: $maintenance_start_time
End Time: $maintenance_end_time
Duration: $((maintenance_duration / 60)) minutes $((maintenance_duration % 60)) seconds

=== System Status After Maintenance ===
Hostname: $(hostname)
Uptime: $(uptime)
Load Average: $(uptime | awk -F'load average:' '{print $2}')

=== Disk Usage ===
$(df -h "$PROJECT_ROOT")

=== Memory Usage ===
$(free -h)

=== Service Status ===
System Services:
$(systemctl is-active redis-server nginx fail2ban 2>/dev/null | paste <(echo -e "redis-server\nnginx\nfail2ban") -)

PM2 Processes:
$(pm2 jlist 2>/dev/null | jq -r '.[] | "\(.name): \(.pm2_env.status)"' 2>/dev/null || echo "PM2 not available")

=== Maintenance Actions Performed ===
EOF
    
    # Add maintenance actions based on tasks performed
    if [[ "$MAINTENANCE_TASKS" == "all" ]] || [[ "$MAINTENANCE_TASKS" == "logs" ]]; then
        echo "- Log rotation and cleanup" >> "$report_file"
    fi
    
    if [[ "$MAINTENANCE_TASKS" == "all" ]] || [[ "$MAINTENANCE_TASKS" == "security" ]]; then
        echo "- Security updates and key rotation check" >> "$report_file"
    fi
    
    if [[ "$MAINTENANCE_TASKS" == "all" ]] || [[ "$MAINTENANCE_TASKS" == "database" ]]; then
        echo "- Database optimization and cleanup" >> "$report_file"
    fi
    
    if [[ "$MAINTENANCE_TASKS" == "all" ]] || [[ "$MAINTENANCE_TASKS" == "optimization" ]]; then
        echo "- System optimization and cache cleanup" >> "$report_file"
    fi
    
    cat >> "$report_file" << EOF

=== Recommendations ===
EOF
    
    # Add recommendations based on system state
    local disk_usage=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $5}' | sed 's/%//')
    if [[ $disk_usage -gt 80 ]]; then
        echo "- Monitor disk usage closely (currently ${disk_usage}%)" >> "$report_file"
    fi
    
    if [[ -f /var/run/reboot-required ]]; then
        echo "- Schedule system reboot for security updates" >> "$report_file"
    fi
    
    local pm2_total=$(pm2 jlist 2>/dev/null | jq length 2>/dev/null || echo 0)
    if [[ $pm2_total -eq 0 ]]; then
        echo "- Verify PM2 processes are configured and running" >> "$report_file"
    fi
    
    echo "- Next maintenance window: $(date -d '+1 week' '+%Y-%m-%d %H:%M')" >> "$report_file"
    
    maintenance_log "Maintenance report generated: $report_file"
    success "Maintenance report generated: $report_file"
}

# Setup automatic maintenance
setup_maintenance_cron() {
    log "Setting up automatic maintenance cron jobs..."
    
    local cron_script="$SCRIPT_DIR/maintain-titan-system.sh"
    
    # Weekly full maintenance (Sunday 2 AM)
    local weekly_cron="0 2 * * 0 $cron_script --mode auto --tasks all >> $LOGS_DIR/maintenance.log 2>&1"
    
    # Daily log maintenance (every day 3 AM)
    local daily_logs="0 3 * * * $cron_script --mode auto --tasks logs --no-restart >> $LOGS_DIR/maintenance.log 2>&1"
    
    # Add cron jobs if they don't exist
    if ! crontab -l 2>/dev/null | grep -q "$cron_script.*--mode auto.*--tasks all"; then
        (crontab -l 2>/dev/null; echo "$weekly_cron") | crontab -
        success "Weekly maintenance cron job added"
    fi
    
    if ! crontab -l 2>/dev/null | grep -q "$cron_script.*--mode auto.*--tasks logs"; then
        (crontab -l 2>/dev/null; echo "$daily_logs") | crontab -
        success "Daily log maintenance cron job added"
    fi
    
    maintenance_log "Automatic maintenance cron jobs configured"
}

# Main maintenance function
perform_maintenance() {
    # Record maintenance start time
    echo "$(date -Iseconds)" > "$PROJECT_ROOT/tmp/maintenance_start_time.txt"
    
    maintenance_log "Starting system maintenance (mode: $MAINTENANCE_MODE, tasks: $MAINTENANCE_TASKS)"
    
    # Check maintenance window
    if ! check_maintenance_window; then
        return 0
    fi
    
    # Pre-maintenance checks
    if ! pre_maintenance_check; then
        return 1
    fi
    
    # Create maintenance snapshot
    create_maintenance_snapshot
    
    # Perform maintenance tasks
    perform_log_maintenance
    perform_security_maintenance
    perform_database_maintenance
    perform_system_optimization
    
    # Restart services if needed
    restart_services_if_needed
    
    # Post-maintenance verification
    if ! post_maintenance_verification; then
        error "Post-maintenance verification failed"
        maintenance_log "Maintenance completed with verification errors"
    else
        success "System maintenance completed successfully"
        maintenance_log "System maintenance completed successfully"
    fi
    
    # Generate maintenance report
    generate_maintenance_report
}

# Display maintenance status
show_maintenance_status() {
    log "Titan System Maintenance Status"
    echo ""
    
    # Last maintenance
    log "Last Maintenance:"
    if [[ -f "$LOGS_DIR/maintenance.log" ]]; then
        local last_maintenance=$(grep "System maintenance completed" "$LOGS_DIR/maintenance.log" | tail -1)
        if [[ -n "$last_maintenance" ]]; then
            echo "  $last_maintenance"
        else
            echo "  No completed maintenance found in logs"
        fi
    else
        echo "  No maintenance log found"
    fi
    echo ""
    
    # System health
    log "System Health:"
    local load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    local disk_usage=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $5}')
    local mem_usage=$(free | awk 'NR==2{printf "%.0f%%", $3*100/$2}')
    
    echo "  Load Average: $load_avg"
    echo "  Disk Usage: $disk_usage"
    echo "  Memory Usage: $mem_usage"
    echo ""
    
    # Maintenance recommendations
    log "Maintenance Recommendations:"
    local recommendations=()
    
    local disk_num=$(echo "$disk_usage" | sed 's/%//')
    if [[ $disk_num -gt 85 ]]; then
        recommendations+=("Disk cleanup needed (${disk_usage} used)")
    fi
    
    if [[ -f /var/run/reboot-required ]]; then
        recommendations+=("System reboot required for security updates")
    fi
    
    # Check log file sizes
    local large_logs=$(find "$LOGS_DIR" -name "*.log" -size +50M 2>/dev/null | wc -l)
    if [[ $large_logs -gt 0 ]]; then
        recommendations+=("Log rotation needed ($large_logs large log files)")
    fi
    
    if [[ ${#recommendations[@]} -eq 0 ]]; then
        echo "  No immediate maintenance needed"
    else
        for rec in "${recommendations[@]}"; do
            echo "  - $rec"
        done
    fi
}

# Display usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
    --mode MODE           Maintenance mode: auto, manual (default: manual)
    --tasks TASKS         Tasks to perform: all, logs, security, database, optimization (default: all)
    --no-restart          Skip service restart after maintenance
    --setup-cron          Setup automatic maintenance cron jobs
    --status              Show current maintenance status
    -h, --help           Show this help message

Examples:
    $0                                    # Full manual maintenance
    $0 --mode auto                       # Automatic maintenance (for cron)
    $0 --tasks logs                      # Log maintenance only
    $0 --tasks security --no-restart     # Security maintenance without restart
    $0 --setup-cron                      # Setup automatic maintenance
    $0 --status                          # Show maintenance status

This script will:
1. Check maintenance window and system health
2. Create maintenance snapshot
3. Perform selected maintenance tasks:
   - Log rotation and cleanup
   - Security updates and key rotation
   - Database optimization
   - System optimization
4. Restart services if needed
5. Verify system health
6. Generate maintenance report

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
            --tasks)
                MAINTENANCE_TASKS="$2"
                shift 2
                ;;
            --no-restart)
                SKIP_SERVICES_RESTART=true
                shift
                ;;
            --setup-cron)
                setup_maintenance_cron
                exit 0
                ;;
            --status)
                show_maintenance_status
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
echo -e "${PURPLE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║         TITAN SYSTEM MAINTENANCE                            ║${NC}"
echo -e "${PURPLE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

parse_args "$@"

# Validate parameters
if [[ ! "$MAINTENANCE_MODE" =~ ^(auto|manual)$ ]]; then
    error "Invalid maintenance mode: $MAINTENANCE_MODE"
    usage
    exit 1
fi

if [[ ! "$MAINTENANCE_TASKS" =~ ^(all|logs|security|database|optimization)$ ]]; then
    error "Invalid maintenance tasks: $MAINTENANCE_TASKS"
    usage
    exit 1
fi

# Create tmp directory if it doesn't exist
mkdir -p "$PROJECT_ROOT/tmp"

# Perform maintenance
perform_maintenance