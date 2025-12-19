#!/bin/bash
#
# Titan Regime Engine - Demo Signal Script
#
# This script simulates a complete trade signal flow:
# 1. PREPARE (5 seconds before bar close)
# 2. CONFIRM (on bar close)
# 3. Optional: ABORT
#
# Usage:
#   ./demo_signal.sh prepare   # Send PREPARE signal
#   ./demo_signal.sh confirm   # Send CONFIRM signal
#   ./demo_signal.sh abort     # Send ABORT signal
#   ./demo_signal.sh full      # Send PREPARE then CONFIRM (full flow)
#

set -e

# Configuration
SERVER_URL="${SERVER_URL:-http://localhost:3001}"
SYMBOL="${SYMBOL:-BTCUSDT}"
TIMEFRAME="${TIMEFRAME:-15}"
BAR_INDEX="${BAR_INDEX:-12345}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
  echo -e "${RED}Error: .env file not found${NC}"
  echo "Copy .env.example to .env and configure HMAC_SECRET"
  exit 1
fi

# Load HMAC_SECRET from .env
export $(grep -v '^#' .env | grep HMAC_SECRET | xargs)

if [ -z "$HMAC_SECRET" ]; then
  echo -e "${RED}Error: HMAC_SECRET not found in .env${NC}"
  exit 1
fi

# Function to generate timestamp
get_timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Function to generate signal ID
get_signal_id() {
  echo "titan_${SYMBOL}_${BAR_INDEX}_${TIMEFRAME}"
}

# Function to sign payload
sign_payload() {
  local payload="$1"
  node sign_webhook.js "$payload"
}

# Function to send webhook
send_webhook() {
  local payload="$1"
  local signal_type="$2"
  
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}Sending ${signal_type} signal...${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "${BLUE}Payload:${NC}"
  echo "$payload" | jq '.'
  echo ""
  
  # Generate signature
  local signature=$(sign_payload "$payload")
  
  echo -e "${BLUE}Signature:${NC} $signature"
  echo ""
  
  # Send request
  echo -e "${YELLOW}Sending request to ${SERVER_URL}/webhook...${NC}"
  echo ""
  
  local response=$(curl -s -X POST "${SERVER_URL}/webhook" \
    -H "Content-Type: application/json" \
    -H "x-signature: $signature" \
    -H "x-source: titan_dashboard" \
    -d "$payload")
  
  echo -e "${GREEN}Response:${NC}"
  echo "$response" | jq '.'
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

# PREPARE signal
send_prepare() {
  local signal_id=$(get_signal_id)
  local timestamp=$(get_timestamp)
  
  local payload=$(cat <<EOF
{
  "signal_id": "$signal_id",
  "type": "PREPARE",
  "symbol": "$SYMBOL",
  "timeframe": "$TIMEFRAME",
  "bar_index": $BAR_INDEX,
  "timestamp": "$timestamp",
  "trigger_price": 50100.0,
  "trigger_condition": "price > 50100",
  "direction": 1,
  "entry_zone": [50100, 50050, 50000],
  "stop_loss": 49500,
  "take_profits": [50500, 51000, 52000],
  "size": 0.1,
  "regime_vector": {
    "trend_state": 1,
    "vol_state": 1,
    "regime_state": 1,
    "market_structure_score": 85,
    "model_recommendation": "TREND_FOLLOW"
  },
  "signal_type": "scalp",
  "alpha_half_life_ms": 10000
}
EOF
)
  
  send_webhook "$payload" "PREPARE"
}

# CONFIRM signal
send_confirm() {
  local signal_id=$(get_signal_id)
  local timestamp=$(get_timestamp)
  
  local payload=$(cat <<EOF
{
  "signal_id": "$signal_id",
  "type": "CONFIRM",
  "symbol": "$SYMBOL",
  "timeframe": "$TIMEFRAME",
  "bar_index": $BAR_INDEX,
  "timestamp": "$timestamp",
  "direction": 1,
  "entry_zone": [50100, 50050, 50000],
  "stop_loss": 49500,
  "take_profits": [50500, 51000, 52000],
  "size": 0.1,
  "regime_vector": {
    "trend_state": 1,
    "vol_state": 1,
    "regime_state": 1,
    "market_structure_score": 85,
    "model_recommendation": "TREND_FOLLOW"
  },
  "signal_type": "scalp"
}
EOF
)
  
  send_webhook "$payload" "CONFIRM"
}

# ABORT signal
send_abort() {
  local signal_id=$(get_signal_id)
  local timestamp=$(get_timestamp)
  
  local payload=$(cat <<EOF
{
  "signal_id": "$signal_id",
  "type": "ABORT",
  "symbol": "$SYMBOL",
  "timestamp": "$timestamp"
}
EOF
)
  
  send_webhook "$payload" "ABORT"
}

# Full flow (PREPARE + CONFIRM)
send_full() {
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  Titan Regime Engine - Full Signal Flow Demo${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BLUE}Symbol:${NC} $SYMBOL"
  echo -e "${BLUE}Timeframe:${NC} $TIMEFRAME"
  echo -e "${BLUE}Bar Index:${NC} $BAR_INDEX"
  echo -e "${BLUE}Signal ID:${NC} $(get_signal_id)"
  echo ""
  
  # Step 1: PREPARE
  echo -e "${YELLOW}Step 1: Sending PREPARE signal (5s before bar close)${NC}"
  echo ""
  send_prepare
  
  # Wait 2 seconds to simulate time passing
  echo -e "${YELLOW}Waiting 2 seconds (simulating time until bar close)...${NC}"
  echo ""
  sleep 2
  
  # Step 2: CONFIRM
  echo -e "${YELLOW}Step 2: Sending CONFIRM signal (on bar close)${NC}"
  echo ""
  send_confirm
  
  # Show final state
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  Signal Flow Complete!${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BLUE}Check Shadow State:${NC}"
  echo "  curl ${SERVER_URL}/state | jq '.'"
  echo ""
  echo -e "${BLUE}Check Position:${NC}"
  echo "  curl ${SERVER_URL}/positions/${SYMBOL} | jq '.'"
  echo ""
  echo -e "${BLUE}Check Limit Chaser Status:${NC}"
  echo "  curl ${SERVER_URL}/limit-chaser/status | jq '.'"
  echo ""
}

# Main
case "${1:-}" in
  prepare)
    send_prepare
    ;;
  confirm)
    send_confirm
    ;;
  abort)
    send_abort
    ;;
  full)
    send_full
    ;;
  *)
    echo "Usage: $0 {prepare|confirm|abort|full}"
    echo ""
    echo "Commands:"
    echo "  prepare  - Send PREPARE signal (pre-fetch L2, calculate size)"
    echo "  confirm  - Send CONFIRM signal (execute via Limit Chaser)"
    echo "  abort    - Send ABORT signal (discard prepared order)"
    echo "  full     - Send complete flow (PREPARE → wait → CONFIRM)"
    echo ""
    echo "Environment variables:"
    echo "  SERVER_URL  - Microservice URL (default: http://localhost:3001)"
    echo "  SYMBOL      - Trading symbol (default: BTCUSDT)"
    echo "  TIMEFRAME   - Chart timeframe (default: 15)"
    echo "  BAR_INDEX   - Bar index for signal ID (default: 12345)"
    echo ""
    echo "Example:"
    echo "  SYMBOL=ETHUSDT ./demo_signal.sh full"
    exit 1
    ;;
esac
