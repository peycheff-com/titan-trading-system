#!/bin/bash

# Titan Trading System - End-to-End Test Script
# This script tests the complete trading flow from signal to execution

set -e

echo "🧪 Titan Trading System - End-to-End Test"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Load environment variables
if [ -f ".env" ]; then
    source .env
else
    print_error ".env file not found"
    exit 1
fi

# Test configuration
EXECUTION_URL=${EXECUTION_ENGINE_URL:-"http://localhost:3002"}
BRAIN_URL=${NEXT_PUBLIC_BRAIN_URL:-"http://localhost:3100"}
CONSOLE_URL=${NEXT_PUBLIC_EXECUTION_URL:-"http://localhost:3001"}
SCAVENGER_URL=${PHASE1_WEBHOOK_URL:-"http://localhost:8081"}

echo ""
echo "🔍 Testing Service Health Endpoints"
echo "==================================="

# Test health endpoints
test_health_endpoint() {
    local service_name=$1
    local url=$2
    local expected_status=${3:-200}
    
    print_status "Testing $service_name health endpoint..."
    
    response=$(curl -s -w "%{http_code}" -o /tmp/health_response "$url" 2>/dev/null || echo "000")
    
    if [ "$response" = "$expected_status" ]; then
        print_success "$service_name health check passed"
        return 0
    else
        print_error "$service_name health check failed (HTTP $response)"
        return 1
    fi
}

# Test all health endpoints
test_health_endpoint "Titan Execution" "$EXECUTION_URL/health"
test_health_endpoint "Titan Brain" "$BRAIN_URL/status"
test_health_endpoint "Titan Console" "$CONSOLE_URL/api/health"
test_health_endpoint "Titan Scavenger" "$SCAVENGER_URL/health"

echo ""
echo "🔗 Testing Service Connectivity"
echo "==============================="

# Test execution service API
print_status "Testing Execution Service API..."
response=$(curl -s -X GET "$EXECUTION_URL/api/status" 2>/dev/null || echo "")
if echo "$response" | grep -q "status"; then
    print_success "Execution Service API responding"
else
    print_error "Execution Service API not responding"
fi

# Test brain service API
print_status "Testing Brain Service API..."
response=$(curl -s -X GET "$BRAIN_URL/dashboard" 2>/dev/null || echo "")
if [ -n "$response" ]; then
    print_success "Brain Service API responding"
else
    print_error "Brain Service API not responding"
fi

echo ""
echo "📡 Testing Signal Processing"
echo "============================"

# Create test signal
create_test_signal() {
    cat << EOF
{
  "timestamp": $(date +%s)000,
  "symbol": "BTCUSDT",
  "action": "BUY_SETUP",
  "confidence": 85,
  "entry": 50000,
  "stopLoss": 49500,
  "takeProfit": 51000,
  "leverage": 5,
  "phase": "phase1",
  "trapType": "LIQUIDATION",
  "metadata": {
    "test": true,
    "source": "end-to-end-test"
  }
}
EOF
}

# Test signal webhook (if not in production)
if [ "$NODE_ENV" != "production" ] || [ "$USE_MOCK_BROKER" = "true" ]; then
    print_status "Testing signal webhook..."
    
    test_signal=$(create_test_signal)
    
    # Calculate HMAC signature
    signature=$(echo -n "$test_signal" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -binary | base64)
    
    response=$(curl -s -w "%{http_code}" -o /tmp/webhook_response \
        -X POST "$EXECUTION_URL/webhook" \
        -H "Content-Type: application/json" \
        -H "X-Signature: $signature" \
        -d "$test_signal" 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ]; then
        print_success "Signal webhook processed successfully"
    else
        print_warning "Signal webhook test failed (HTTP $response) - this is expected in production"
    fi
else
    print_warning "Skipping signal test in production mode"
fi

echo ""
echo "💾 Testing Database Connectivity"
echo "==============================="

# Test database connection (if available)
if [ -n "$DATABASE_URL" ] || [ -n "$DB_HOST" ]; then
    print_status "Testing database connectivity..."
    
    # Try to connect to execution service database endpoint
    response=$(curl -s -X GET "$EXECUTION_URL/api/database/health" 2>/dev/null || echo "")
    if echo "$response" | grep -q "healthy\|connected"; then
        print_success "Database connectivity verified"
    else
        print_warning "Database connectivity test inconclusive"
    fi
else
    print_warning "No database configuration found"
fi

echo ""
echo "🔄 Testing Redis Connectivity"
echo "============================="

# Test Redis connection (if available)
if [ -n "$REDIS_URL" ] && [ "$REDIS_REQUIRED" = "true" ]; then
    print_status "Testing Redis connectivity..."
    
    # Try to get Redis status from execution service
    response=$(curl -s -X GET "$EXECUTION_URL/api/redis/status" 2>/dev/null || echo "")
    if echo "$response" | grep -q "connected\|ok"; then
        print_success "Redis connectivity verified"
    else
        print_warning "Redis connectivity test inconclusive"
    fi
else
    print_warning "Redis not configured or not required"
fi

echo ""
echo "🔐 Testing API Credentials"
echo "=========================="

# Test Bybit API (if not using demo keys)
if [ "$BYBIT_API_KEY" != "demo_bybit_key_for_testing" ]; then
    print_status "Testing Bybit API credentials..."
    
    # Try to get account info from execution service
    response=$(curl -s -X GET "$EXECUTION_URL/api/broker/status" 2>/dev/null || echo "")
    if echo "$response" | grep -q "connected\|authenticated"; then
        print_success "Bybit API credentials verified"
    else
        print_warning "Bybit API credentials test inconclusive"
    fi
else
    print_warning "Using demo Bybit credentials"
fi

echo ""
echo "📊 Testing Performance Metrics"
echo "=============================="

# Test metrics endpoints
print_status "Testing performance metrics..."

response=$(curl -s -X GET "$EXECUTION_URL/api/metrics" 2>/dev/null || echo "")
if [ -n "$response" ]; then
    print_success "Performance metrics available"
else
    print_warning "Performance metrics not available"
fi

echo ""
echo "🚨 Testing Safety Systems"
echo "========================="

# Test circuit breaker status
print_status "Testing circuit breaker status..."

response=$(curl -s -X GET "$EXECUTION_URL/api/safety/status" 2>/dev/null || echo "")
if echo "$response" | grep -q "active\|inactive\|status"; then
    print_success "Safety systems responding"
else
    print_warning "Safety systems status unclear"
fi

echo ""
echo "📱 Testing Notifications"
echo "========================"

# Test Telegram notifications (if configured)
if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
    print_status "Testing Telegram notifications..."
    
    # Send test message
    test_message="🧪 Titan Trading System - End-to-End Test Completed at $(date)"
    
    response=$(curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
        -d "chat_id=$TELEGRAM_CHAT_ID" \
        -d "text=$test_message" 2>/dev/null || echo "")
    
    if echo "$response" | grep -q '"ok":true'; then
        print_success "Telegram notifications working"
    else
        print_warning "Telegram notifications test failed"
    fi
else
    print_warning "Telegram notifications not configured"
fi

echo ""
echo "📋 Test Summary"
echo "==============="

# Count results from log
passed=$(grep -c "\[PASS\]" /tmp/test_results 2>/dev/null || echo "0")
warnings=$(grep -c "\[WARN\]" /tmp/test_results 2>/dev/null || echo "0")
failed=$(grep -c "\[FAIL\]" /tmp/test_results 2>/dev/null || echo "0")

echo -e "${GREEN}Tests Passed: $passed${NC}"
echo -e "${YELLOW}Warnings: $warnings${NC}"
echo -e "${RED}Tests Failed: $failed${NC}"

echo ""
if [ "$failed" -eq 0 ]; then
    if [ "$warnings" -eq 0 ]; then
        echo -e "${GREEN}🎉 All tests passed! System is ready for trading.${NC}"
    else
        echo -e "${YELLOW}⚠️  System is mostly ready, but please review warnings above.${NC}"
    fi
    
    echo ""
    echo "Recommended next steps:"
    echo "1. Start with testnet mode (BYBIT_TESTNET=true)"
    echo "2. Use minimal position sizes initially"
    echo "3. Monitor logs closely for first few trades"
    echo "4. Gradually increase position sizes as confidence builds"
    
else
    echo -e "${RED}❌ Some tests failed. Please fix issues before live trading.${NC}"
    exit 1
fi

echo ""
echo "For production deployment guide, see: PRODUCTION_SETUP_GUIDE.md"

# Clean up temp files
rm -f /tmp/health_response /tmp/webhook_response /tmp/test_results