# Developer Quickstart

> **Goal**: From zero to running `titan-brain` in 5 minutes.

## 1. Prerequisites
- **Docker & Docker Compose** (Latest).
- **Node.js**: v20+ (LTS).
- **Rust**: 1.75+ (`rustup update`).
- **MkCert**: For local SSL (optional but recommended).

## 2. Setup

### 2.1 Clone & Install
```bash
git clone git@github.com:peycheff-com/titan-trading-system.git
cd titan-trading-system
npm install
```

### 2.2 Environment
```bash
cp .env.example .env
# Edit .env and set TITAN_MODE=DISARMED
```
*Note: You do not need real Exchange Keys to run the Simulator.*

### 2.3 Secrets
Generate a local HMAC secret:
```bash
openssl rand -hex 32
# Add to .env as HMAC_SECRET
```

## 3. Running Local Stack

### 3.1 Operator-Sim Mode
Run the entire organism (Mock Exchange + Brain + Strategy).
```bash
npm run start:sim
```
Accessible at:
- **Console**: http://localhost:8080
- **Grafana**: http://localhost:3000
- **NATS**: localhost:4222

### 3.2 Running Services Individually
For focused development (e.g., Brain only):
```bash
# 1. Start Infrastructure (DB, NATS, Redis)
docker compose up -d titan-postgres titan-nats titan-redis

# 2. Run Brain in Watch Mode
npm run dev:brain
```

## 4. Verification
Check if the heart is beating:
```bash
curl http://localhost:3100/health
# {"status":"ok","components":{...}}
```
