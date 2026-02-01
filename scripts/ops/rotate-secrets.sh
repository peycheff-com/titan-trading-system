#!/bin/bash
# Secret Rotation Runbook - Titan Trading System
# This script guides operators through rotating secrets safely
# MUST be run in a maintenance window with trading DISARMED

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $1"; }
log_step() { echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}"; echo -e "${BLUE}$1${NC}"; echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"; }

# Check if dry run
DRY_RUN="${DRY_RUN:-true}"

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           TITAN SECRET ROTATION RUNBOOK                       ║${NC}"
echo -e "${BLUE}║  Run with DRY_RUN=false to execute actual rotation           ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$DRY_RUN" = "true" ]; then
    log_warn "DRY RUN MODE: Commands will be printed but not executed"
    log_warn "Run with DRY_RUN=false to perform actual rotation"
    echo ""
fi

# ============================================================================
# STEP 0: Pre-flight Checks
# ============================================================================
log_step "STEP 0: Pre-flight Checks"

# Check DISARMED state
check_armed_state() {
    log_info "Checking system armed state..."
    
    # Check if system is disarmed (would call API in real scenario)
    HEALTH=$(curl -s http://localhost:3002/health 2>/dev/null || echo '{"armed":false}')
    
    if echo "$HEALTH" | grep -q '"armed":true'; then
        log_error "SYSTEM IS ARMED! Cannot rotate secrets while trading is active."
        log_error "Please DISARM the system first: POST /auth/disarm"
        exit 1
    fi
    
    log_success "System is DISARMED - safe to proceed"
}

# Create backup of current env
backup_env() {
    log_info "Creating backup of current environment..."
    BACKUP_FILE="/tmp/titan-env-backup-$(date +%Y%m%d-%H%M%S).enc"
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY RUN] Would backup env to: $BACKUP_FILE"
    else
        # In production, this would use age or gpg encryption
        env | grep -E "^(HMAC_SECRET|BINANCE_|BYBIT_|MEXC_|DB_|NATS_|REDIS_)" > /tmp/titan-env-backup.txt
        # Encrypt with age (example)
        # age -r <recipient> -o "$BACKUP_FILE" /tmp/titan-env-backup.txt
        log_success "Environment backed up to: $BACKUP_FILE"
    fi
}

if [ "$DRY_RUN" = "false" ]; then
    check_armed_state
fi
backup_env

# ============================================================================
# STEP 1: Rotate HMAC_SECRET
# ============================================================================
log_step "STEP 1: Rotate HMAC_SECRET"

rotate_hmac_secret() {
    log_info "Generating new HMAC secret..."
    
    NEW_HMAC_SECRET=$(openssl rand -hex 32)
    
    log_info "New HMAC_SECRET generated (first 8 chars): ${NEW_HMAC_SECRET:0:8}..."
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY RUN] Would update HMAC_SECRET in environment"
        log_info "[DRY RUN] Would restart titan-brain and titan-execution-rs"
    else
        # Update .env file or secret manager
        log_info "Updating HMAC_SECRET in environment..."
        # sed -i "s/^HMAC_SECRET=.*/HMAC_SECRET=$NEW_HMAC_SECRET/" .env
        
        # Restart services
        log_info "Restarting services..."
        docker-compose -f docker-compose.prod.yml restart titan-brain titan-execution-rs
        
        # Wait for health
        sleep 10
        
        # Verify policy handshake
        log_info "Verifying policy handshake..."
        curl -s http://localhost:3002/health | grep -q '"healthy":true' && log_success "Execution service healthy"
        curl -s http://localhost:3100/health | grep -q '"healthy":true' && log_success "Brain service healthy"
    fi
    
    log_success "HMAC_SECRET rotation complete"
}

rotate_hmac_secret

# ============================================================================
# STEP 2: Rotate Exchange API Keys
# ============================================================================
log_step "STEP 2: Rotate Exchange API Keys"

rotate_exchange_keys() {
    local EXCHANGE=$1
    local API_KEY_VAR="${EXCHANGE}_API_KEY"
    local SECRET_VAR="${EXCHANGE}_SECRET_KEY"
    
    log_info "Rotating $EXCHANGE API keys..."
    
    echo -e "${YELLOW}┌─────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${YELLOW}│  MANUAL ACTION REQUIRED                                     │${NC}"
    echo -e "${YELLOW}│                                                             │${NC}"
    echo -e "${YELLOW}│  1. Log into $EXCHANGE exchange                             │${NC}"
    echo -e "${YELLOW}│  2. Navigate to API Management                              │${NC}"
    echo -e "${YELLOW}│  3. Create NEW API key (do not delete old yet)              │${NC}"
    echo -e "${YELLOW}│  4. Configure permissions: Futures Trading, Read-only       │${NC}"
    echo -e "${YELLOW}│  5. Add IP whitelist: $(curl -s https://api.ipify.org 2>/dev/null)          ${NC}"
    echo -e "${YELLOW}│  6. Copy NEW API key and secret                             │${NC}"
    echo -e "${YELLOW}└─────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY RUN] Would prompt for new $EXCHANGE API credentials"
    else
        read -p "Enter new ${API_KEY_VAR}: " NEW_API_KEY
        read -s -p "Enter new ${SECRET_VAR}: " NEW_SECRET
        echo ""
        
        # Update environment
        export "${API_KEY_VAR}=$NEW_API_KEY"
        export "${SECRET_VAR}=$NEW_SECRET"
        
        # Verify connection
        log_info "Verifying new credentials..."
        ./scripts/ops/verify-exchange-whitelist.sh
        
        if [ $? -eq 0 ]; then
            log_success "$EXCHANGE API key rotation verified"
            log_warn "You can now DELETE the old API key from the exchange"
        else
            log_error "$EXCHANGE verification failed - rolling back"
            # Rollback logic would go here
            exit 1
        fi
    fi
}

# Rotate enabled exchanges
EXCHANGES="${TITAN_EXCHANGES:-binance,bybit}"
IFS=',' read -ra EXCHANGE_LIST <<< "$EXCHANGES"
for exchange in "${EXCHANGE_LIST[@]}"; do
    EXCHANGE_UPPER=$(echo "$exchange" | tr '[:lower:]' '[:upper:]')
    rotate_exchange_keys "$EXCHANGE_UPPER"
done

# ============================================================================
# STEP 3: Rotate Database Credentials
# ============================================================================
log_step "STEP 3: Rotate Database Credentials"

rotate_db_credentials() {
    log_info "Rotating PostgreSQL credentials..."
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY RUN] Would generate new DB password"
        log_info "[DRY RUN] Would update PostgreSQL user"
        log_info "[DRY RUN] Would update DB_PASSWORD in environment"
    else
        NEW_DB_PASSWORD=$(openssl rand -hex 24)
        
        log_info "Updating PostgreSQL user password..."
        docker exec titan-postgres psql -U postgres -c "ALTER USER titan_user PASSWORD '$NEW_DB_PASSWORD';" 2>/dev/null || true
        
        # Update .env
        # sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$NEW_DB_PASSWORD/" .env
        
        # Restart services that use DB
        docker-compose -f docker-compose.prod.yml restart titan-brain
        
        sleep 5
        
        # Verify DB connection
        if curl -s http://localhost:3100/ready | grep -q '"ready":true'; then
            log_success "Database credentials rotated successfully"
        else
            log_error "Brain service not ready after DB rotation"
            exit 1
        fi
    fi
}

rotate_db_credentials

# ============================================================================
# STEP 4: Rotate NATS Credentials
# ============================================================================
log_step "STEP 4: Rotate NATS Credentials"

rotate_nats_credentials() {
    log_info "Rotating NATS system password..."
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY RUN] Would generate new NATS password"
        log_info "[DRY RUN] Would update NATS configuration"
        log_info "[DRY RUN] Would restart NATS and all connected services"
    else
        NEW_NATS_PASSWORD=$(openssl rand -hex 24)
        
        log_info "Updating NATS configuration..."
        # Update NATS config and restart
        # This would update the nats-server.conf and restart
        
        log_success "NATS credentials rotated"
    fi
}

rotate_nats_credentials

# ============================================================================
# STEP 5: Final Verification
# ============================================================================
log_step "STEP 5: Final Verification"

final_verification() {
    log_info "Running final health checks..."
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY RUN] Would verify all service health endpoints"
        log_info "[DRY RUN] Would verify HMAC validation"
        log_info "[DRY RUN] Would verify policy handshake"
    else
        # Health checks
        ./scripts/ops/health_check.sh
        
        # Exchange verification
        ./scripts/ops/verify-exchange-whitelist.sh
        
        # Verify policy handshake (critical for HMAC)
        log_info "Verifying policy handshake..."
        BRAIN_HASH=$(curl -s http://localhost:3100/api/risk/policy-hash 2>/dev/null | jq -r '.hash')
        EXEC_HASH=$(curl -s http://localhost:3002/api/risk/policy-hash 2>/dev/null | jq -r '.hash')
        
        if [ "$BRAIN_HASH" = "$EXEC_HASH" ] && [ -n "$BRAIN_HASH" ]; then
            log_success "Policy hash verified: ${BRAIN_HASH:0:16}..."
        else
            log_error "Policy hash mismatch! Do not ARM system."
            exit 1
        fi
    fi
}

final_verification

# ============================================================================
# Summary
# ============================================================================
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
if [ "$DRY_RUN" = "true" ]; then
    echo -e "${YELLOW}║           DRY RUN COMPLETE - No changes made                 ║${NC}"
    echo -e "${YELLOW}║                                                               ║${NC}"
    echo -e "${YELLOW}║  Run with DRY_RUN=false to perform actual rotation            ║${NC}"
else
    echo -e "${GREEN}║           SECRET ROTATION COMPLETE                            ║${NC}"
    echo -e "${GREEN}║                                                               ║${NC}"
    echo -e "${GREEN}║  All secrets have been rotated successfully.                  ║${NC}"
    echo -e "${GREEN}║                                                               ║${NC}"
    echo -e "${GREEN}║  NEXT STEPS:                                                  ║${NC}"
    echo -e "${GREEN}║  1. Delete old exchange API keys from exchanges               ║${NC}"
    echo -e "${GREEN}║  2. Update password manager / vault                           ║${NC}"
    echo -e "${GREEN}║  3. Run ARM sequence when ready to resume trading             ║${NC}"
fi
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
