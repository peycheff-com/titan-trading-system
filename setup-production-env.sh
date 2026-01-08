#!/bin/bash

# Titan Trading System - Interactive Production Environment Setup
# This script helps you configure your production environment safely

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    TITAN TRADING SYSTEM - PRODUCTION ENVIRONMENT SETUP     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}This script will help you configure Titan for production deployment.${NC}"
echo -e "${CYAN}Please have your exchange API credentials ready.${NC}"
echo ""

# Function to generate secure random string
generate_secret() {
    local length=${1:-32}
    node -e "console.log(require('crypto').randomBytes($length).toString('hex'))" 2>/dev/null || \
    openssl rand -hex $length 2>/dev/null || \
    head -c $length /dev/urandom | xxd -p | tr -d '\n'
}

# Function to prompt for input with default
prompt_with_default() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    local is_secret="${4:-false}"
    
    if [ "$is_secret" = "true" ]; then
        echo -e "${YELLOW}$prompt${NC}"
        if [ -n "$default" ]; then
            echo -e "${CYAN}Press Enter to use default: [HIDDEN]${NC}"
        fi
        read -s input
    else
        if [ -n "$default" ]; then
            echo -e "${YELLOW}$prompt${NC} ${CYAN}(default: $default)${NC}"
        else
            echo -e "${YELLOW}$prompt${NC}"
        fi
        read input
    fi
    
    if [ -z "$input" ]; then
        input="$default"
    fi
    
    eval "$var_name='$input'"
}

# Function to validate API key format
validate_api_key() {
    local key="$1"
    local exchange="$2"
    
    case "$exchange" in
        "binance")
            if [[ ${#key} -ge 64 && "$key" =~ ^[A-Za-z0-9]+$ ]]; then
                return 0
            fi
            ;;
        "bybit")
            if [[ ${#key} -ge 20 && "$key" =~ ^[A-Za-z0-9]+$ ]]; then
                return 0
            fi
            ;;
    esac
    return 1
}

# Check if .env already exists
if [ -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env file already exists.${NC}"
    echo -e "${YELLOW}Do you want to:${NC}"
    echo -e "  1) Update existing configuration"
    echo -e "  2) Create backup and start fresh"
    echo -e "  3) Exit and configure manually"
    echo ""
    read -p "Choose option (1-3): " choice
    
    case $choice in
        1)
            echo -e "${BLUE}Updating existing configuration...${NC}"
            source .env
            ;;
        2)
            echo -e "${BLUE}Creating backup...${NC}"
            cp .env ".env.backup.$(date +%Y%m%d_%H%M%S)"
            echo -e "${GREEN}Backup created: .env.backup.$(date +%Y%m%d_%H%M%S)${NC}"
            ;;
        3)
            echo -e "${CYAN}Please edit .env file manually and run ./validate-production-setup.sh${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid choice. Exiting.${NC}"
            exit 1
            ;;
    esac
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 1: Exchange API Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo ""
echo -e "${CYAN}📊 Binance API Configuration${NC}"
echo -e "${CYAN}Required for: Signal validation, market data${NC}"
echo -e "${CYAN}Permissions needed: Read-only (Spot & Futures)${NC}"
echo -e "${CYAN}Get from: https://www.binance.com/en/my/settings/api-management${NC}"
echo ""

prompt_with_default "Enter your Binance API Key:" "$BINANCE_API_KEY" "BINANCE_API_KEY"
if ! validate_api_key "$BINANCE_API_KEY" "binance"; then
    echo -e "${YELLOW}⚠️  Warning: API key format looks unusual for Binance${NC}"
fi

prompt_with_default "Enter your Binance API Secret:" "$BINANCE_API_SECRET" "BINANCE_API_SECRET" true

echo ""
echo -e "${CYAN}🎯 Bybit API Configuration${NC}"
echo -e "${CYAN}Required for: Order execution, position management${NC}"
echo -e "${CYAN}Permissions needed: Derivatives Trading${NC}"
echo -e "${CYAN}Get from: https://www.bybit.com/app/user/api-management${NC}"
echo ""

prompt_with_default "Enter your Bybit API Key:" "$BYBIT_API_KEY" "BYBIT_API_KEY"
if ! validate_api_key "$BYBIT_API_KEY" "bybit"; then
    echo -e "${YELLOW}⚠️  Warning: API key format looks unusual for Bybit${NC}"
fi

prompt_with_default "Enter your Bybit API Secret:" "$BYBIT_API_SECRET" "BYBIT_API_SECRET" true

echo ""
echo -e "${YELLOW}🧪 Testnet Configuration${NC}"
echo -e "${CYAN}Recommended: Start with testnet for initial testing${NC}"
echo ""
echo -e "Do you want to use Bybit testnet? (recommended for first deployment)"
echo -e "  1) Yes - Use testnet (safe for testing)"
echo -e "  2) No - Use production (real money)"
read -p "Choose option (1-2): " testnet_choice

case $testnet_choice in
    1)
        BYBIT_TESTNET="true"
        echo -e "${GREEN}✅ Testnet mode enabled${NC}"
        ;;
    2)
        BYBIT_TESTNET="false"
        echo -e "${RED}⚠️  Production mode enabled - real money at risk!${NC}"
        ;;
    *)
        BYBIT_TESTNET="true"
        echo -e "${YELLOW}Invalid choice, defaulting to testnet${NC}"
        ;;
esac

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 2: Security Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo ""
echo -e "${CYAN}🔐 Master Password${NC}"
echo -e "${CYAN}Used for: Encrypting sensitive data, credential storage${NC}"
echo -e "${CYAN}Requirements: 12+ characters, mix of letters/numbers/symbols${NC}"
echo ""

# Generate a strong default password
default_password="Titan$(date +%Y)!Secure$(shuf -i 100-999 -n 1)"
prompt_with_default "Enter master password (or press Enter for generated):" "$default_password" "TITAN_MASTER_PASSWORD" true

if [ ${#TITAN_MASTER_PASSWORD} -lt 12 ]; then
    echo -e "${RED}❌ Password too short. Generating secure password...${NC}"
    TITAN_MASTER_PASSWORD="Titan$(date +%Y)!Secure$(shuf -i 1000-9999 -n 1)"
    echo -e "${GREEN}✅ Generated secure password${NC}"
fi

echo ""
echo -e "${CYAN}🔑 Cryptographic Secrets${NC}"
echo -e "${CYAN}Generating secure HMAC secrets...${NC}"

HMAC_SECRET=$(generate_secret 32)
WEBHOOK_SECRET=$(generate_secret 32)

echo -e "${GREEN}✅ HMAC secrets generated${NC}"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 3: Risk Management Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo ""
echo -e "${CYAN}💰 Initial Capital${NC}"
echo -e "${CYAN}Recommended: Start with $500-$2000 for Phase 1${NC}"
echo ""

prompt_with_default "Enter initial equity (USD):" "${INITIAL_EQUITY:-1000}" "INITIAL_EQUITY"

# Validate initial equity
if [ "$INITIAL_EQUITY" -lt 200 ]; then
    echo -e "${YELLOW}⚠️  Warning: Initial equity is very low (minimum $200 recommended)${NC}"
elif [ "$INITIAL_EQUITY" -gt 10000 ]; then
    echo -e "${YELLOW}⚠️  Warning: High initial equity for first deployment. Consider starting smaller.${NC}"
fi

echo ""
echo -e "${CYAN}⚖️ Risk Parameters${NC}"
echo -e "${CYAN}Choose risk profile:${NC}"
echo -e "  1) Conservative (1% risk, 3% daily drawdown) - Recommended"
echo -e "  2) Moderate (2% risk, 5% daily drawdown)"
echo -e "  3) Aggressive (3% risk, 7% daily drawdown)"
echo -e "  4) Custom"
echo ""
read -p "Choose risk profile (1-4): " risk_choice

case $risk_choice in
    1)
        MAX_RISK_PCT="0.01"
        MAX_DAILY_DRAWDOWN_PCT="0.03"
        MAX_TOTAL_LEVERAGE="5"
        echo -e "${GREEN}✅ Conservative risk profile selected${NC}"
        ;;
    2)
        MAX_RISK_PCT="0.02"
        MAX_DAILY_DRAWDOWN_PCT="0.05"
        MAX_TOTAL_LEVERAGE="10"
        echo -e "${YELLOW}⚠️  Moderate risk profile selected${NC}"
        ;;
    3)
        MAX_RISK_PCT="0.03"
        MAX_DAILY_DRAWDOWN_PCT="0.07"
        MAX_TOTAL_LEVERAGE="20"
        echo -e "${RED}⚠️  Aggressive risk profile selected${NC}"
        ;;
    4)
        prompt_with_default "Max risk per trade (0.01 = 1%):" "0.01" "MAX_RISK_PCT"
        prompt_with_default "Max daily drawdown (0.03 = 3%):" "0.03" "MAX_DAILY_DRAWDOWN_PCT"
        prompt_with_default "Max total leverage:" "5" "MAX_TOTAL_LEVERAGE"
        echo -e "${BLUE}✅ Custom risk profile configured${NC}"
        ;;
    *)
        MAX_RISK_PCT="0.01"
        MAX_DAILY_DRAWDOWN_PCT="0.03"
        MAX_TOTAL_LEVERAGE="5"
        echo -e "${YELLOW}Invalid choice, defaulting to conservative${NC}"
        ;;
esac

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 4: Database Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo ""
echo -e "${CYAN}🗄️ PostgreSQL Configuration${NC}"
echo -e "${CYAN}Used by: Brain service for state management${NC}"
echo ""

prompt_with_default "Database host:" "${DB_HOST:-localhost}" "DB_HOST"
prompt_with_default "Database port:" "${DB_PORT:-5432}" "DB_PORT"
prompt_with_default "Database name:" "${DB_NAME:-titan_brain_production}" "DB_NAME"
prompt_with_default "Database user:" "${DB_USER:-postgres}" "DB_USER"

if [ -z "$DB_PASSWORD" ]; then
    DB_PASSWORD="titan_prod_$(generate_secret 8)"
fi
prompt_with_default "Database password (or press Enter for generated):" "$DB_PASSWORD" "DB_PASSWORD" true

echo ""
echo -e "${CYAN}📦 Redis Configuration${NC}"
echo -e "${CYAN}Used by: Inter-service communication, caching${NC}"
echo ""

prompt_with_default "Redis URL:" "${REDIS_URL:-redis://localhost:6379}" "REDIS_URL"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 5: Notifications (Optional)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo ""
echo -e "${CYAN}📱 Telegram Notifications${NC}"
echo -e "${CYAN}Recommended for: Trade alerts, system notifications${NC}"
echo -e "${CYAN}Setup: Create bot with @BotFather, get chat ID${NC}"
echo ""

read -p "Configure Telegram notifications? (y/N): " setup_telegram
if [[ $setup_telegram =~ ^[Yy]$ ]]; then
    prompt_with_default "Telegram Bot Token:" "$TELEGRAM_BOT_TOKEN" "TELEGRAM_BOT_TOKEN"
    prompt_with_default "Telegram Chat ID:" "$TELEGRAM_CHAT_ID" "TELEGRAM_CHAT_ID"
    echo -e "${GREEN}✅ Telegram notifications configured${NC}"
else
    TELEGRAM_BOT_TOKEN=""
    TELEGRAM_CHAT_ID=""
    echo -e "${YELLOW}⚠️  Telegram notifications skipped${NC}"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 6: Writing Configuration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo ""
echo -e "${CYAN}💾 Creating .env file...${NC}"

# Create the .env file
cat > .env << EOF
# ============================================================================
# TITAN TRADING SYSTEM - PRODUCTION ENVIRONMENT CONFIGURATION
# Generated on: $(date)
# ============================================================================

# ============================================================================
# SYSTEM-WIDE SETTINGS
# ============================================================================
NODE_ENV=production
LOG_LEVEL=info
TZ=UTC
PRODUCTION_MODE=true

# ============================================================================
# SECURITY & AUTHENTICATION
# ============================================================================
TITAN_MASTER_PASSWORD=$TITAN_MASTER_PASSWORD
HMAC_SECRET=$HMAC_SECRET
WEBHOOK_SECRET=$WEBHOOK_SECRET

# ============================================================================
# EXCHANGE API CREDENTIALS
# ============================================================================
BINANCE_API_KEY=$BINANCE_API_KEY
BINANCE_API_SECRET=$BINANCE_API_SECRET

BYBIT_API_KEY=$BYBIT_API_KEY
BYBIT_API_SECRET=$BYBIT_API_SECRET
BYBIT_TESTNET=$BYBIT_TESTNET
BYBIT_CATEGORY=linear
BYBIT_RATE_LIMIT_RPS=10
BYBIT_MAX_RETRIES=3
BYBIT_ACCOUNT_CACHE_TTL=5000

# Legacy broker credentials (for compatibility)
BROKER_API_KEY=$BYBIT_API_KEY
BROKER_API_SECRET=$BYBIT_API_SECRET

# ============================================================================
# TRADING & RISK PARAMETERS
# ============================================================================
INITIAL_EQUITY=$INITIAL_EQUITY
USE_MOCK_BROKER=false

# Risk parameters
MAX_RISK_PCT=$MAX_RISK_PCT
PHASE_1_RISK_PCT=$MAX_RISK_PCT
PHASE_2_RISK_PCT=$(echo "$MAX_RISK_PCT * 0.8" | bc -l 2>/dev/null || echo "$MAX_RISK_PCT")

# Fee configuration
MAKER_FEE_PCT=0.0002
TAKER_FEE_PCT=0.0006

# Position sizing limits
MAX_POSITION_SIZE_PCT=0.1
MAX_TOTAL_LEVERAGE=$MAX_TOTAL_LEVERAGE

# ============================================================================
# CIRCUIT BREAKER & SAFETY SYSTEMS
# ============================================================================
MAX_DAILY_DRAWDOWN_PCT=$MAX_DAILY_DRAWDOWN_PCT
MAX_WEEKLY_DRAWDOWN_PCT=$(echo "$MAX_DAILY_DRAWDOWN_PCT * 1.5" | bc -l 2>/dev/null || echo "0.05")
BREAKER_MAX_DAILY_DRAWDOWN=$MAX_DAILY_DRAWDOWN_PCT

# Minimum equity thresholds
BREAKER_MIN_EQUITY=$(echo "$INITIAL_EQUITY * 0.8" | bc -l 2>/dev/null || echo "800")
CAPITAL_RESERVE_LIMIT=200

# Consecutive loss protection
MAX_CONSECUTIVE_LOSSES=2
BREAKER_CONSECUTIVE_LOSS_LIMIT=2
BREAKER_CONSECUTIVE_LOSS_WINDOW=3600000
CIRCUIT_BREAKER_COOLDOWN_HOURS=4

# Safety thresholds
ZSCORE_SAFETY_THRESHOLD=-2.0
DRAWDOWN_VELOCITY_THRESHOLD=0.02
EMERGENCY_STOP_LOSS_PCT=0.1

# Trading frequency limits
MIN_TRADE_INTERVAL_MS=30000
MAX_TRADES_PER_HOUR=10
MAX_TRADES_PER_DAY=50

# Heartbeat & monitoring
HEARTBEAT_TIMEOUT_MS=300000

# ============================================================================
# DATABASE CONFIGURATION
# ============================================================================
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_MAX_CONNECTIONS=20
DB_IDLE_TIMEOUT=30000

# SQLite (Execution service)
DATABASE_URL=./titan_execution_production.db
DATABASE_TYPE=sqlite

# ============================================================================
# REDIS CONFIGURATION
# ============================================================================
REDIS_URL=$REDIS_URL
REDIS_REQUIRED=true
REDIS_MAX_RETRIES=3
REDIS_RETRY_DELAY=1000
IDEMPOTENCY_TTL=300

# ============================================================================
# SERVER PORTS & NETWORKING
# ============================================================================
TITAN_BRAIN_PORT=3100
TITAN_EXECUTION_PORT=3002
TITAN_CONSOLE_PORT=3001
TITAN_SCAVENGER_PORT=8081

SERVER_HOST=0.0.0.0
SERVER_PORT=3100
PORT=3002
HOST=0.0.0.0

CORS_ORIGINS=http://localhost:3001,https://your-domain.com
RATE_LIMIT_PER_SEC=12

# ============================================================================
# NOTIFICATIONS
# ============================================================================
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID=$TELEGRAM_CHAT_ID

# ============================================================================
# INTEGRATION URLS
# ============================================================================
EXECUTION_ENGINE_URL=http://localhost:3002
CONSOLE_URL=http://localhost:3002
NEXT_PUBLIC_EXECUTION_URL=http://localhost:3002
NEXT_PUBLIC_BRAIN_URL=http://localhost:3100

# ============================================================================
# PRODUCTION SAFETY FLAGS
# ============================================================================
FUNDING_GREED_THRESHOLD=100
FUNDING_HIGH_GREED_THRESHOLD=50
FUNDING_FEAR_THRESHOLD=-50

# ============================================================================
# BRAIN SERVICE CONFIGURATION
# ============================================================================
BRAIN_SIGNAL_TIMEOUT=100
BRAIN_METRIC_UPDATE_INTERVAL=60000
BRAIN_DASHBOARD_CACHE_TTL=5000
BRAIN_MAX_QUEUE_SIZE=100

# Capital flow settings
CAPITAL_SWEEP_THRESHOLD=1.2
CAPITAL_SWEEP_SCHEDULE="0 0 * * *"
CAPITAL_MAX_RETRIES=3
CAPITAL_RETRY_BASE_DELAY=1000

# ============================================================================
# EXECUTION SERVICE CONFIGURATION
# ============================================================================
WS_ORDERBOOK_URL=wss://stream.bybit.com/v5/public/linear
WS_CACHE_MAX_AGE_MS=100

# Validation thresholds
MIN_STRUCTURE_THRESHOLD=60
MAX_SPREAD_PCT=0.001
MAX_SLIPPAGE_PCT=0.002

# Replay guard settings
MAX_TIMESTAMP_DRIFT_MS=5000
SIGNAL_CACHE_TTL_MS=300000
EOF

# Set secure permissions
chmod 600 .env

echo -e "${GREEN}✅ .env file created with secure permissions${NC}"

# Create symbolic links for services
echo ""
echo -e "${CYAN}🔗 Creating environment links for services...${NC}"

./setup-env.sh

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 7: Validation${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo ""
echo -e "${CYAN}🔍 Running production setup validation...${NC}"

./validate-production-setup.sh

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         PRODUCTION ENVIRONMENT SETUP COMPLETE              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✅ Configuration completed successfully!${NC}"
echo ""
echo -e "${BLUE}📋 Configuration Summary:${NC}"
echo -e "  • Initial Equity: \$$INITIAL_EQUITY"
echo -e "  • Risk per Trade: $(echo "$MAX_RISK_PCT * 100" | bc -l 2>/dev/null || echo "1")%"
echo -e "  • Daily Drawdown Limit: $(echo "$MAX_DAILY_DRAWDOWN_PCT * 100" | bc -l 2>/dev/null || echo "3")%"
echo -e "  • Max Total Leverage: ${MAX_TOTAL_LEVERAGE}x"
echo -e "  • Testnet Mode: $BYBIT_TESTNET"
if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    echo -e "  • Telegram Alerts: ✅ Enabled"
else
    echo -e "  • Telegram Alerts: ❌ Disabled"
fi
echo ""
echo -e "${BLUE}🚀 Next Steps:${NC}"
if [ "$BYBIT_TESTNET" = "true" ]; then
    echo -e "  1. ${CYAN}Test with testnet: ./deploy-production.sh${NC}"
    echo -e "  2. ${CYAN}Monitor performance and adjust parameters${NC}"
    echo -e "  3. ${CYAN}When ready, set BYBIT_TESTNET=false and redeploy${NC}"
else
    echo -e "  1. ${YELLOW}⚠️  You're in production mode - real money at risk!${NC}"
    echo -e "  2. ${CYAN}Deploy carefully: ./deploy-production.sh${NC}"
    echo -e "  3. ${CYAN}Monitor closely and start with small positions${NC}"
fi
echo -e "  4. ${CYAN}Access dashboard: http://localhost:3001${NC}"
echo -e "  5. ${CYAN}Monitor logs: tail -f logs/*.log${NC}"
echo ""
echo -e "${YELLOW}⚠️  Important Security Reminders:${NC}"
echo -e "  • Never commit .env file to version control"
echo -e "  • Keep API keys secure and rotate regularly"
echo -e "  • Monitor system resources and performance"
echo -e "  • Set up proper backups and monitoring"
echo -e "  • Start with small position sizes"
echo ""
echo -e "${CYAN}For detailed instructions, see: PRODUCTION_SETUP_GUIDE.md${NC}"