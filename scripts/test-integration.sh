#!/bin/bash

# Configuration
API_URL="http://localhost:3100"
EXECUTION_URL="http://localhost:3002"
BRAIN_LOG="logs/brain.log"

echo "Checking system health..."
curl -s "$API_URL/status" | grep "status" || { echo "Brain health check failed"; exit 1; }
curl -s "$EXECUTION_URL/health" | grep "status" || { echo "Execution health check failed"; exit 1; }

echo "Sending test signal..."
# Assuming a Phase 1 signal structure
curl -X POST "$API_URL/signal" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "PHASE_1_TRAP",
    "symbol": "BTC/USD",
    "side": "BUY",
    "confidence": 0.95,
    "timestamp": '$(date +%s)000'
  }'

echo "Verifying processed signal..."
sleep 2
# Check logs for signal processing
grep "Received signal" "$BRAIN_LOG" | tail -n 1 || { echo "Signal not found in brain logs"; exit 1; }

echo "Integration test passed!"
