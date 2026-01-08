#!/bin/bash

# Titan Trading System - Production Setup Validator
# This script validates your production environment configuration

# Don't exit on errors, we want to show all validation results
# set -e

echo "🔍 Titan Trading System - Production Setup Validator"
echo "===================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNING=0

# Function to print colored output
print_check() {
    echo -e "${BLUE}[CHECK]${NC} $1"
}

print_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((CHECKS_PASSED++))
}

print_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((CHECKS_FAILED++))
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((CHECKS_WARNING++))
}

# Load environment variables
if [ -f ".env" ]; then
    source .env
    print_pass ".env file found and loaded"
else
    print_fail ".env file not found"
    exit 1
fi

echo ""
echo "🔐 API Credentials Validation"
echo "============================="

# Check Binance API credentials
print_check "Validating Binance API credentials..."
if [ -n "$BINANCE_API_KEY" ] && [ "$BINANCE_API_KEY" != "demo_binance_key_for_testing" ]; then
    if [ -n "$BINANCE_API_SECRET" ] && [ "$BINANCE_API_SECRET" != "demo_binance_secret_for_testing" ]; then
        print_pass "Binance API credentials configured"
    else
        print_fail "Binance API secret is missing or still using demo value"
    fi
else
    print_fail "Binance API key is missing or still using demo value"
fi

# Check Bybit API credentials
print_check "Validating Bybit API credentials..."
if [ -n "$BYBIT_API_KEY" ] && [ "$BYBIT_API_KEY" != "demo_bybit_key_for_testing" ]; then
    if [ -n "$BYBIT_API_SECRET" ] && [ "$BYBIT_API_SECRET" != "demo_bybit_secret_for_testing" ]; then
        print_pass "Bybit API credentials configured"
        
        # Check testnet setting
        if [ "$BYBIT_TESTNET" = "true" ]; then
            print_warn "Bybit is set to testnet mode (good for testing)"
        else
            print_pass "Bybit is set to production mode"
        fi
    else
        print_fail "Bybit API secret is missing or still using demo value"
    fi
else
    print_fail "Bybit API key is missing or still using demo value"
fi

echo ""
echo "🔒 Security Configuration"
echo "========================"

# Check master password
print_check "Validating master password..."
if [ -n "$TITAN_MASTER_PASSWORD" ] && [ "$TITAN_MASTER_PASSWORD" != "TitanSecure2024!Production" ]; then
    if [ ${#TITAN_MASTER_PASSWORD} -ge 12 ]; then
        print_pass "Master password is configured and strong"
    else
        print_warn "Master password is too short (should be 12+ characters)"
    fi
else
    print_fail "Master password is missing or using default value"
fi

# Check HMAC secrets
print_check "Validating HMAC secrets..."
if [ -n "$HMAC_SECRET" ] && [ ${#HMAC_SECRET} -ge 32 ]; then
    print_pass "HMAC secret is configured"
else
    print_fail "HMAC secret is missing or too short (should be 32+ characters)"
fi

if [ -n "$WEBHOOK_SECRET" ] && [ ${#WEBHOOK_SECRET} -ge 32 ]; then
    print_pass "Webhook secret is configured"
else
    print_fail "Webhook secret is missing or too short (should be 32+ characters)"
fi

echo ""
echo "💰 Risk Management Configuration"
echo "==============================="

# Check risk parameters
print_check "Validating risk parameters..."
if [ -n "$MAX_RISK_PCT" ]; then
    print_pass "Max risk per trade configured: ${MAX_RISK_PCT}"
    # Simple string comparison for common values
    if [ "$MAX_RISK_PCT" = "0.01" ] || [ "$MAX_RISK_PCT" = "0.005" ]; then
        print_pass "Risk level is conservative"
    elif [ "$MAX_RISK_PCT" = "0.02" ]; then
        print_pass "Risk level is moderate"
    else
        print_warn "Review risk level: ${MAX_RISK_PCT} (recommend 0.01 for initial deployment)"
    fi
else
    print_fail "MAX_RISK_PCT not configured"
fi

# Check initial equity
print_check "Validating initial equity..."
if [ -n "$INITIAL_EQUITY" ]; then
    if [ "$INITIAL_EQUITY" -ge 200 ] && [ "$INITIAL_EQUITY" -le 5000 ]; then
        print_pass "Initial equity: \$${INITIAL_EQUITY} (appropriate for Phase 1)"
    elif [ "$INITIAL_EQUITY" -lt 200 ]; then
        print_warn "Initial equity: \$${INITIAL_EQUITY} (very low, consider increasing)"
    else
        print_warn "Initial equity: \$${INITIAL_EQUITY} (high for initial deployment)"
    fi
else
    print_fail "INITIAL_EQUITY not configured"
fi

# Check circuit breaker settings
print_check "Validating circuit breaker settings..."
if [ -n "$MAX_DAILY_DRAWDOWN_PCT" ]; then
    print_pass "Max daily drawdown configured: ${MAX_DAILY_DRAWDOWN_PCT}"
    # Simple string comparison for common values
    if [ "$MAX_DAILY_DRAWDOWN_PCT" = "0.03" ] || [ "$MAX_DAILY_DRAWDOWN_PCT" = "0.02" ]; then
        print_pass "Drawdown limit is conservative"
    elif [ "$MAX_DAILY_DRAWDOWN_PCT" = "0.05" ]; then
        print_pass "Drawdown limit is moderate"
    else
        print_warn "Review drawdown limit: ${MAX_DAILY_DRAWDOWN_PCT} (recommend 0.03 for initial deployment)"
    fi
else
    print_fail "MAX_DAILY_DRAWDOWN_PCT not configured"
fi

echo ""
echo "🗄️ Database Configuration"
echo "========================"

# Check database settings
print_check "Validating database configuration..."
if [ -n "$DB_HOST" ] && [ "$DB_HOST" != "localhost" ]; then
    print_pass "Database host configured: $DB_HOST"
else
    print_warn "Database host is localhost (ensure this is correct for production)"
fi

if [ -n "$DB_NAME" ] && [ "$DB_NAME" != "titan_brain_production" ]; then
    print_pass "Database name configured: $DB_NAME"
else
    print_warn "Database name is default value"
fi

# Check Redis configuration
print_check "Validating Redis configuration..."
if [ -n "$REDIS_URL" ] && [ "$REDIS_URL" != "redis://localhost:6379" ]; then
    print_pass "Redis URL configured"
else
    print_warn "Redis URL is localhost (ensure this is correct for production)"
fi

if [ "$REDIS_REQUIRED" = "true" ]; then
    print_pass "Redis is required (good for production)"
else
    print_warn "Redis is not required (consider enabling for production)"
fi

echo ""
echo "📱 Notification Configuration"
echo "============================"

# Check Telegram configuration
print_check "Validating Telegram notifications..."
if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
    print_pass "Telegram notifications configured"
else
    print_warn "Telegram notifications not configured (recommended for production)"
fi

# Check email configuration
print_check "Validating email notifications..."
if [ -n "$EMAIL_SMTP_HOST" ] && [ -n "$EMAIL_SMTP_USER" ]; then
    print_pass "Email notifications configured"
else
    print_warn "Email notifications not configured (optional)"
fi

echo ""
echo "🌐 Service Configuration"
echo "======================="

# Check service ports
print_check "Validating service ports..."
services=("TITAN_BRAIN_PORT" "TITAN_EXECUTION_PORT" "TITAN_CONSOLE_PORT" "TITAN_SCAVENGER_PORT")
for service in "${services[@]}"; do
    if [ -n "${!service}" ]; then
        print_pass "$service configured: ${!service}"
    else
        print_fail "$service not configured"
    fi
done

# Check production mode
print_check "Validating production mode..."
if [ "$NODE_ENV" = "production" ]; then
    print_pass "NODE_ENV set to production"
else
    print_warn "NODE_ENV is not set to production"
fi

if [ "$PRODUCTION_MODE" = "true" ]; then
    print_pass "Production mode enabled"
else
    print_warn "Production mode not enabled"
fi

echo ""
echo "📊 Summary"
echo "=========="
echo -e "${GREEN}Checks Passed: $CHECKS_PASSED${NC}"
echo -e "${YELLOW}Warnings: $CHECKS_WARNING${NC}"
echo -e "${RED}Checks Failed: $CHECKS_FAILED${NC}"

echo ""
if [ $CHECKS_FAILED -eq 0 ]; then
    if [ $CHECKS_WARNING -eq 0 ]; then
        echo -e "${GREEN}🎉 All checks passed! Your setup looks ready for production.${NC}"
    else
        echo -e "${YELLOW}⚠️  Setup is mostly ready, but please review the warnings above.${NC}"
    fi
else
    echo -e "${RED}❌ Setup has critical issues that must be fixed before production deployment.${NC}"
    echo ""
    echo "Please fix the failed checks and run this script again."
    exit 1
fi

echo ""
echo "Next steps:"
echo "1. Review any warnings above"
echo "2. Test with testnet first (BYBIT_TESTNET=true)"
echo "3. Deploy to Railway using: ./deploy-to-railway.sh"
echo "4. Set up monitoring and alerts"
echo "5. Start with minimal capital and risk"
echo ""
echo "For detailed instructions, see: PRODUCTION_SETUP_GUIDE.md"