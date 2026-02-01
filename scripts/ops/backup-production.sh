#!/bin/bash
# JetStream and PostgreSQL Backup Script for Production
# Part of INV-02: JetStream Durability invariant
set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

# Configuration
DO_TOKEN="${DO_API_TOKEN:-}"
BACKUP_SPACE="${TITAN_BACKUP_SPACE:-titan-backups}"
BACKUP_REGION="${TITAN_BACKUP_REGION:-ams3}"
JETSTREAM_VOLUME="${TITAN_JETSTREAM_VOLUME:-titan-jetstream-vol}"
DATE_TAG=$(date +%Y%m%d)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Database configuration
DB_HOST=${TITAN_DB_HOST:-"localhost"}
DB_PORT=${TITAN_DB_PORT:-"5432"}
DB_USER=${TITAN_DB_USER:-"postgres"}
DB_PASS=${TITAN_DB_PASSWORD:-"postgres"}
DB_NAME=${TITAN_DB_NAME:-"titan_brain"}

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# =============================================================================
# JETSTREAM VOLUME SNAPSHOT (INV-02)
# =============================================================================
backup_jetstream() {
    log_info "Starting JetStream volume snapshot..."
    
    if [ -z "$DO_TOKEN" ]; then
        log_error "DO_API_TOKEN not set. Cannot create volume snapshot."
        log_warn "Skipping JetStream snapshot (manual backup required)"
        return 1
    fi

    # Get volume ID
    VOLUME_ID=$(doctl compute volume list --format ID,Name --no-header | grep "$JETSTREAM_VOLUME" | awk '{print $1}')
    
    if [ -z "$VOLUME_ID" ]; then
        log_error "Volume $JETSTREAM_VOLUME not found"
        return 1
    fi

    log_info "Creating snapshot of volume $VOLUME_ID ($JETSTREAM_VOLUME)..."
    
    if doctl compute volume-snapshot create "$VOLUME_ID" \
        --snapshot-name "jetstream-${DATE_TAG}" \
        --region "$BACKUP_REGION"; then
        log_success "JetStream volume snapshot created: jetstream-${DATE_TAG}"
    else
        log_error "Failed to create JetStream snapshot"
        return 1
    fi
    
    # Cleanup old snapshots (keep last 7 days)
    log_info "Cleaning up old JetStream snapshots..."
    OLD_SNAPSHOTS=$(doctl compute volume-snapshot list --format ID,Name,CreatedAt --no-header | \
        grep "jetstream-" | \
        head -n -7 | \
        awk '{print $1}')
    
    for snapshot_id in $OLD_SNAPSHOTS; do
        log_info "Deleting old snapshot: $snapshot_id"
        doctl compute volume-snapshot delete "$snapshot_id" --force || true
    done
}

# =============================================================================
# POSTGRESQL BACKUP
# =============================================================================
backup_postgres() {
    log_info "Starting PostgreSQL backup..."
    
    local BACKUP_DIR="./backups/postgres"
    mkdir -p "$BACKUP_DIR"
    
    local BACKUP_FILE="${BACKUP_DIR}/titan_db_${TIMESTAMP}.sql.gz"
    
    export PGPASSWORD="${DB_PASS}"
    
    if pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" | gzip > "$BACKUP_FILE"; then
        log_success "PostgreSQL backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
        
        # Upload to Spaces if available
        if command -v s3cmd &> /dev/null && [ -f ~/.s3cfg ]; then
            log_info "Uploading to DigitalOcean Spaces..."
            if s3cmd put "$BACKUP_FILE" "s3://${BACKUP_SPACE}/db/$(basename "$BACKUP_FILE")"; then
                log_success "Uploaded to s3://${BACKUP_SPACE}/db/"
            else
                log_warn "Failed to upload to Spaces (backup still exists locally)"
            fi
        fi
    else
        log_error "PostgreSQL backup failed"
        return 1
    fi
    
    # Cleanup old local backups (keep last 3)
    cd "$BACKUP_DIR"
    ls -t titan_db_*.sql.gz 2>/dev/null | tail -n +4 | xargs -I {} rm -- {} 2>/dev/null || true
}

# =============================================================================
# REDIS RDB BACKUP
# =============================================================================
backup_redis() {
    log_info "Starting Redis RDB snapshot..."
    
    local BACKUP_DIR="./backups/redis"
    mkdir -p "$BACKUP_DIR"
    
    # Trigger BGSAVE and wait
    redis-cli BGSAVE 2>/dev/null || {
        log_warn "Could not trigger Redis BGSAVE (redis-cli not available or Redis not running)"
        return 0
    }
    
    sleep 5
    
    # Copy RDB file if accessible
    local REDIS_RDB="${REDIS_RDB_PATH:-/data/redis/dump.rdb}"
    if [ -f "$REDIS_RDB" ]; then
        cp "$REDIS_RDB" "${BACKUP_DIR}/redis_${TIMESTAMP}.rdb"
        log_success "Redis RDB backup created: ${BACKUP_DIR}/redis_${TIMESTAMP}.rdb"
    else
        log_warn "Redis RDB file not found at $REDIS_RDB"
    fi
}

# =============================================================================
# BACKUP VERIFICATION
# =============================================================================
verify_backups() {
    log_info "Verifying backup health..."
    
    local STATUS=0
    
    # Check JetStream snapshots
    if [ -n "$DO_TOKEN" ]; then
        SNAPSHOT_COUNT=$(doctl compute volume-snapshot list --format Name --no-header 2>/dev/null | grep -c "jetstream-" || echo "0")
        if [ "$SNAPSHOT_COUNT" -gt 0 ]; then
            log_success "JetStream snapshots: $SNAPSHOT_COUNT available"
        else
            log_warn "No JetStream snapshots found"
            STATUS=1
        fi
    fi
    
    # Check latest PostgreSQL backup
    LATEST_PG=$(ls -t ./backups/postgres/titan_db_*.sql.gz 2>/dev/null | head -1)
    if [ -n "$LATEST_PG" ]; then
        AGE_HOURS=$(( ($(date +%s) - $(stat -f %m "$LATEST_PG" 2>/dev/null || stat -c %Y "$LATEST_PG" 2>/dev/null)) / 3600 ))
        if [ "$AGE_HOURS" -lt 25 ]; then
            log_success "PostgreSQL backup: $(basename "$LATEST_PG") ($AGE_HOURS hours old)"
        else
            log_warn "PostgreSQL backup is stale: $AGE_HOURS hours old"
            STATUS=1
        fi
    else
        log_warn "No PostgreSQL backups found"
        STATUS=1
    fi
    
    return $STATUS
}

# =============================================================================
# MAIN
# =============================================================================
main() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Titan Production Backup Script       ${NC}"
    echo -e "${BLUE}  $(date)                              ${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    local FAILED=0
    
    case "${1:-all}" in
        jetstream)
            backup_jetstream || FAILED=1
            ;;
        postgres)
            backup_postgres || FAILED=1
            ;;
        redis)
            backup_redis || FAILED=1
            ;;
        verify)
            verify_backups || FAILED=1
            ;;
        all)
            backup_jetstream || FAILED=1
            backup_postgres || FAILED=1
            backup_redis || FAILED=1
            verify_backups || true
            ;;
        *)
            echo "Usage: $0 {all|jetstream|postgres|redis|verify}"
            exit 1
            ;;
    esac
    
    if [ $FAILED -eq 0 ]; then
        log_success "All backups completed successfully"
    else
        log_error "Some backups failed - check logs above"
        exit 1
    fi
}

main "$@"
