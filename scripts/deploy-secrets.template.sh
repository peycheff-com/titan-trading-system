#!/bin/bash
set -euo pipefail
# ============================================================================
# TITAN DEPLOYMENT SECRETS TEMPLATE
# Usage:
# 1. Copy to deploy-secrets.sh: cp deploy-secrets.template.sh deploy-secrets.sh
# 2. Fill in the values (DO NOT COMMIT THE FILLED FILE TO GIT!)
# 3. Source before deployment: source deploy-secrets.sh && docker compose -f docker-compose.prod.yml up -d
# ============================================================================

# --- SECURITY ---
export TITAN_MASTER_PASSWORD="__CHANGE_ME__"  # Admin dashboard password
export HMAC_SECRET="__CHANGE_ME_RANDOM_HEX_64_CHARS__" # For internal API signing
export WEBHOOK_SECRET="__CHANGE_ME__" # For external webhooks

# --- DATABASE ---
export TITAN_DB_USER="titan"
export TITAN_DB_PASSWORD="__CHANGE_ME_STRONG_PASSWORD__"
export TITAN_DB_NAME="titan_brain_production"

# --- EXCHANGES ---
export BINANCE_API_KEY="__CHANGE_ME__"
export BINANCE_API_SECRET="__CHANGE_ME__"
export BYBIT_API_KEY="__CHANGE_ME__"
export BYBIT_API_SECRET="__CHANGE_ME__"

# --- STAGING / TESTNET ---
export BINANCE_TESTNET_KEY="__CHANGE_ME__"
export BINANCE_TESTNET_SECRET="__CHANGE_ME__"

# --- AI SERVICES ---
export GEMINI_API_KEY="__CHANGE_ME__"
export WEAVIATE_API_KEY="__CHANGE_ME__"

# --- NOTIFICATIONS ---
export TELEGRAM_BOT_TOKEN="__CHANGE_ME__"
export TELEGRAM_CHAT_ID="__CHANGE_ME__"

# --- INFRASTRUCTURE ---
export ACME_EMAIL="admin@yourdomain.com"
export DOMAIN="yourdomain.com"
