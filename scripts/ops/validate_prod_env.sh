#!/bin/bash
# =============================================================================
# validate_prod_env.sh — Pre-deploy environment validation
# =============================================================================
# Ensures all required environment variables are set and not default values
# before deploying to production.
#
# Usage: ./scripts/ops/validate_prod_env.sh [.env path]
# =============================================================================
set -euo pipefail

ENV_FILE="${1:-.env}"

echo "🔍 Validating production environment (${ENV_FILE})..."

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ FATAL: Environment file not found: ${ENV_FILE}"
    exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

ERRORS=0

# --- Required variables ---
REQUIRED_VARS=(
    "POSTGRES_PASSWORD"
    "REDIS_PASSWORD"
    "NATS_SYS_PASSWORD"
    "NATS_BRAIN_PASSWORD"
    "NATS_EXECUTION_PASSWORD"
    "NATS_SCAVENGER_PASSWORD"
    "NATS_HUNTER_PASSWORD"
    "NATS_SENTINEL_PASSWORD"
    "NATS_POWERLAW_PASSWORD"
    "NATS_QUANT_PASSWORD"
    "NATS_CONSOLE_PASSWORD"
    "HMAC_SECRET"
    "DOMAIN_NAME"
    "GRAFANA_ADMIN_PASSWORD"
)

for var in "${REQUIRED_VARS[@]}"; do
    val="${!var:-}"
    if [ -z "$val" ]; then
        echo "  ❌ Missing: ${var}"
        ERRORS=$((ERRORS + 1))
    fi
done

# --- Reject known default/placeholder values ---
DEFAULTS_CHECK=(
    "POSTGRES_PASSWORD:password"
    "POSTGRES_PASSWORD:postgres"
    "REDIS_PASSWORD:redis_password"
    "HMAC_SECRET:titan_dev_hmac_secret"
    "HMAC_SECRET:changeme"
    "GRAFANA_ADMIN_PASSWORD:admin"
    "NATS_SYS_PASSWORD:sys_password"
    "NATS_SYS_PASSWORD:__CHANGE_ME__"
    "NATS_SYS_PASSWORD:mock"
    "NATS_BRAIN_PASSWORD:brain_password"
    "NATS_EXECUTION_PASSWORD:execution_password"
    "NATS_SCAVENGER_PASSWORD:scavenger_password"
    "NATS_HUNTER_PASSWORD:hunter_password"
    "NATS_SENTINEL_PASSWORD:sentinel_password"
    "NATS_POWERLAW_PASSWORD:powerlaw_password"
    "NATS_QUANT_PASSWORD:quant_password"
    "NATS_CONSOLE_PASSWORD:console_password"
)

for check in "${DEFAULTS_CHECK[@]}"; do
    var="${check%%:*}"
    bad_val="${check#*:}"
    actual="${!var:-}"
    if [ "$actual" = "$bad_val" ]; then
        echo "  ⚠️  ${var} is set to a known default value '${bad_val}' — must be changed for production"
        ERRORS=$((ERRORS + 1))
    fi
done

# --- Validate docker compose config ---
echo ""
echo "🔧 Validating docker-compose.prod.yml..."
if docker compose -f docker-compose.prod.yml config --quiet 2>/dev/null; then
    echo "  ✅ docker compose config passes"
else
    echo "  ❌ docker compose config failed — check variable interpolation"
    ERRORS=$((ERRORS + 1))
fi

echo ""
if [ $ERRORS -gt 0 ]; then
    echo "❌ VALIDATION FAILED: ${ERRORS} error(s) found."
    echo "   Fix all issues before deploying to production."
    exit 1
else
    echo "✅ All production environment checks passed."
    exit 0
fi
