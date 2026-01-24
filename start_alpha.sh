#!/bin/bash
# Start Titan Brain and Scavenger in Alpha Mode

# Kill existing processes
pkill -f "titan-brain"
pkill -f "titan-phase1-scavenger"

# Start Brain
export NODE_ENV=production

# Start Infrastructure
echo "Starting Infrastructure (NATS, Redis, Postgres)..."
docker compose up -d nats redis postgres
echo "Waiting for infrastructure to initialize..."
sleep 10
# Shared Config Manager likely expects permissive matching or specific prefixes
export SERVER_PORT=3100
export PORT=3100
export TITAN_BRAIN_PORT=3100
export LOG_LEVEL=info
export TITAN_BRAIN_LOG_LEVEL=info

export TITAN_DB_HOST=localhost
export TITAN_DB_PORT=5432
export TITAN_DB_NAME=titan_brain
export TITAN_DB_USER=postgres
export TITAN_DB_PASSWORD=postgres
export TITAN_BRAIN_DATABASE_HOST=localhost
export TITAN_BRAIN_DATABASE_PORT=5432
export TITAN_BRAIN_DATABASE_NAME=titan_brain
export TITAN_BRAIN_DATABASE_USER=postgres
export TITAN_BRAIN_DATABASE_PASSWORD=postgres
export TITAN_BRAIN_DATABASE_SSL=false

export REDIS_URL=redis://localhost:6379
export TITAN_BRAIN_REDIS_URL=redis://localhost:6379
export TITAN_BRAIN_REDIS_KEY_PREFIX=titan-brain:

# NATS is required
export NATS_URL=nats://localhost:4222
export NATS_USER=brain
export NATS_PASS=brain_password

echo "Starting Titan Brain..."
cd services/titan-brain
npm start >> brain.log 2>&1 &
BRAIN_PID=$!
echo "Brain PID: $BRAIN_PID"

# Start Scavenger
echo "Starting Titan Scavenger..."
# Credentials for Paper Trading (Dummy)
export BINANCE_API_KEY=dummy_key
export BINANCE_API_SECRET=dummy_secret
# Bybit credentials also needed for initialization?
export BYBIT_API_KEY=dummy_key
export BYBIT_API_SECRET=dummy_secret

cd ../titan-phase1-scavenger
npm run start:headless >> scavenger.log 2>&1 &
SCAVENGER_PID=$!
echo "Scavenger PID: $SCAVENGER_PID"

echo "Services started. View logs in respective directories."
