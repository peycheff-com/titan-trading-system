#!/bin/bash
set -e

BRAIN_URL="http://localhost:3100"
PID_FILE=".brain.pid"

echo "🧪 Starting Failover Test..."

# 1. Verify Brain is running
if [ ! -f "$PID_FILE" ]; then
    echo "❌ Brain PID file not found. Is it running?"
    exit 1
fi

BRAIN_PID=$(cat "$PID_FILE")
echo "ℹ️  Found Brain PID: $BRAIN_PID"

echo "Checking health before kill..."
curl -s -f "$BRAIN_URL/status" > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ Brain is online"
else
    echo "❌ Brain is offline."
    exit 1
fi

# 2. Kill Brain
echo "🔪 Killing Brain process..."
kill -9 "$BRAIN_PID"
rm "$PID_FILE"
sleep 2

# Verify it's dead
if curl -s "$BRAIN_URL/status" > /dev/null 2>&1; then
    echo "❌ Brain is still responding!"
    exit 1
else
    echo "✅ Brain successfully killed"
fi

# 3. Restart Brain (Mock supervisor behavior)
echo "🔄 Restarting Brain..."
# Re-run the Brain start command from start-titan.sh
# Loading same env vars as start-titan.sh roughly
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=titan_brain
export DB_USER=$(whoami)

cd services/titan-brain
node dist/index.js > "../../logs/brain-failover.log" 2>&1 &
NEW_PID=$!
echo $NEW_PID > "../../$PID_FILE"
cd ../..

echo "ℹ️  New Brain PID: $NEW_PID"

# 4. Wait for Recovery
echo "⏳ Waiting for recovery..."
MAX_RETRIES=30
COUNT=0
while [ $COUNT -lt $MAX_RETRIES ]; do
    if curl -s -f "$BRAIN_URL/status" > /dev/null 2>&1; then
        echo "✅ Brain recovered successfully"
        exit 0
    fi
    echo "   ...waiting ($COUNT/$MAX_RETRIES)"
    sleep 1
    COUNT=$((COUNT+1))
done

echo "❌ Brain failed to recover"
exit 1
