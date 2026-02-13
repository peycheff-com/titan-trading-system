#!/bin/bash
set -euo pipefail
# Exchange IP Whitelist Verification
# Verifies that the current external IP is whitelisted on all enabled exchanges
# Run this BEFORE production deployment to avoid API access issues

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

# Configuration
ENABLED_EXCHANGES="${TITAN_EXCHANGES:-binance,bybit}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Exchange IP Whitelist Verification    ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Step 1: Get current external IP
log_info "Getting current external IP..."
EXTERNAL_IP=$(curl -s https://api.ipify.org 2>/dev/null || curl -s https://ifconfig.me 2>/dev/null)

if [ -z "$EXTERNAL_IP" ]; then
    log_error "Could not determine external IP"
    exit 1
fi

log_success "External IP: $EXTERNAL_IP"
echo ""

# Step 2: Check each exchange
FAILED=0

check_binance() {
    log_info "Checking Binance API access..."
    
    if [ -z "$BINANCE_API_KEY" ] || [ -z "$BINANCE_SECRET_KEY" ]; then
        log_warn "BINANCE_API_KEY or BINANCE_SECRET_KEY not set - skipping authenticated check"
        
        # Try public endpoint
        RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "https://fapi.binance.com/fapi/v1/exchangeInfo")
        if [ "$RESPONSE" = "200" ]; then
            log_success "Binance public API accessible"
        else
            log_error "Binance public API returned $RESPONSE"
            return 1
        fi
        return 0
    fi
    
    # Check authenticated endpoint
    TIMESTAMP=$(date +%s000)
    QUERY="timestamp=$TIMESTAMP"
    SIGNATURE=$(echo -n "$QUERY" | openssl dgst -sha256 -hmac "$BINANCE_SECRET_KEY" | cut -d' ' -f2)
    
    RESPONSE=$(curl -s -X GET \
        -H "X-MBX-APIKEY: $BINANCE_API_KEY" \
        "https://fapi.binance.com/fapi/v2/account?$QUERY&signature=$SIGNATURE")
    
    if echo "$RESPONSE" | grep -q '"totalWalletBalance"'; then
        log_success "Binance API authenticated and accessible"
        return 0
    elif echo "$RESPONSE" | grep -q '"code":-2015'; then
        log_error "Binance: Invalid API key, IP not whitelisted, or key not for futures"
        log_warn "Action required: Add $EXTERNAL_IP to Binance API key whitelist"
        return 1
    else
        log_error "Binance API error: $RESPONSE"
        return 1
    fi
}

check_bybit() {
    log_info "Checking Bybit API access..."
    
    if [ -z "$BYBIT_API_KEY" ] || [ -z "$BYBIT_SECRET_KEY" ]; then
        log_warn "BYBIT_API_KEY or BYBIT_SECRET_KEY not set - skipping authenticated check"
        
        # Try public endpoint
        RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT")
        if [ "$RESPONSE" = "200" ]; then
            log_success "Bybit public API accessible"
        else
            log_error "Bybit public API returned $RESPONSE"
            return 1
        fi
        return 0
    fi
    
    # Check authenticated endpoint
    TIMESTAMP=$(date +%s000)
    RECV_WINDOW=5000
    SIGN_STRING="${TIMESTAMP}${BYBIT_API_KEY}${RECV_WINDOW}"
    SIGNATURE=$(echo -n "$SIGN_STRING" | openssl dgst -sha256 -hmac "$BYBIT_SECRET_KEY" | cut -d' ' -f2)
    
    RESPONSE=$(curl -s -X GET \
        -H "X-BAPI-API-KEY: $BYBIT_API_KEY" \
        -H "X-BAPI-TIMESTAMP: $TIMESTAMP" \
        -H "X-BAPI-RECV-WINDOW: $RECV_WINDOW" \
        -H "X-BAPI-SIGN: $SIGNATURE" \
        "https://api.bybit.com/v5/account/wallet-balance?accountType=UNIFIED")
    
    if echo "$RESPONSE" | grep -q '"retCode":0'; then
        log_success "Bybit API authenticated and accessible"
        return 0
    elif echo "$RESPONSE" | grep -q '"retCode":10003'; then
        log_error "Bybit: Invalid API key or IP not whitelisted"
        log_warn "Action required: Add $EXTERNAL_IP to Bybit API key whitelist"
        return 1
    else
        log_error "Bybit API error: $RESPONSE"
        return 1
    fi
}

check_mexc() {
    log_info "Checking MEXC API access..."
    
    if [ -z "$MEXC_API_KEY" ] || [ -z "$MEXC_SECRET_KEY" ]; then
        log_warn "MEXC_API_KEY or MEXC_SECRET_KEY not set - skipping authenticated check"
        
        # Try public endpoint
        RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "https://contract.mexc.com/api/v1/contract/detail")
        if [ "$RESPONSE" = "200" ]; then
            log_success "MEXC public API accessible"
        else
            log_error "MEXC public API returned $RESPONSE"
            return 1
        fi
        return 0
    fi
    
    # Check authenticated endpoint
    TIMESTAMP=$(date +%s000)
    QUERY="timestamp=$TIMESTAMP"
    SIGNATURE=$(echo -n "$QUERY" | openssl dgst -sha256 -hmac "$MEXC_SECRET_KEY" | cut -d' ' -f2)
    
    RESPONSE=$(curl -s -X GET \
        -H "X-MEXC-APIKEY: $MEXC_API_KEY" \
        "https://contract.mexc.com/api/v1/private/account/assets?$QUERY&signature=$SIGNATURE")
    
    if echo "$RESPONSE" | grep -q '"success":true'; then
        log_success "MEXC API authenticated and accessible"
        return 0
    else
        log_error "MEXC API error: $RESPONSE"
        log_warn "Action required: Verify MEXC API key settings and IP whitelist"
        return 1
    fi
}

# Run checks for enabled exchanges
IFS=',' read -ra EXCHANGES <<< "$ENABLED_EXCHANGES"
for exchange in "${EXCHANGES[@]}"; do
    case $exchange in
        binance)
            check_binance || FAILED=1
            ;;
        bybit)
            check_bybit || FAILED=1
            ;;
        mexc)
            check_mexc || FAILED=1
            ;;
        *)
            log_warn "Unknown exchange: $exchange (skipping)"
            ;;
    esac
    echo ""
done

# Summary
echo -e "${BLUE}========================================${NC}"
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}  All exchange checks PASSED            ${NC}"
    echo -e "${GREEN}  External IP: $EXTERNAL_IP             ${NC}"
else
    echo -e "${RED}  Some exchange checks FAILED           ${NC}"
    echo -e "${RED}  Action Required: Update IP whitelists ${NC}"
    echo -e "${YELLOW}  Current IP to whitelist: $EXTERNAL_IP ${NC}"
fi
echo -e "${BLUE}========================================${NC}"

exit $FAILED
