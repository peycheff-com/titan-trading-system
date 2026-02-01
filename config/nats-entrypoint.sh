#!/bin/sh
# NATS Entrypoint Script
# Generates nats.conf from template by substituting environment variables
# This ensures passwords are never committed to version control

set -e

TEMPLATE_FILE="/etc/nats/nats.conf.template"
CONFIG_FILE="/etc/nats/nats.conf"

# Validate required environment variables
required_vars="NATS_SYS_PASSWORD NATS_BRAIN_PASSWORD NATS_EXECUTION_PASSWORD NATS_SCAVENGER_PASSWORD NATS_HUNTER_PASSWORD NATS_SENTINEL_PASSWORD NATS_POWERLAW_PASSWORD NATS_QUANT_PASSWORD NATS_CONSOLE_PASSWORD"

echo "[NATS-ENTRYPOINT] Validating required environment variables..."

for var in $required_vars; do
    eval "value=\$$var"
    if [ -z "$value" ]; then
        echo "[NATS-ENTRYPOINT] ERROR: Required environment variable $var is not set"
        echo "[NATS-ENTRYPOINT] FAIL-CLOSED: Refusing to start NATS without proper credentials"
        exit 1
    fi
done

echo "[NATS-ENTRYPOINT] All required variables present. Generating config..."

# Generate config from template using sed (POSIX-compatible, no envsubst needed)
# Note: Alpine NATS image doesn't have gettext-base/envsubst
# Template uses $VAR format (not ${VAR})
sed \
  -e "s|\\\$NATS_SYS_PASSWORD|$NATS_SYS_PASSWORD|g" \
  -e "s|\\\$NATS_BRAIN_PASSWORD|$NATS_BRAIN_PASSWORD|g" \
  -e "s|\\\$NATS_EXECUTION_PASSWORD|$NATS_EXECUTION_PASSWORD|g" \
  -e "s|\\\$NATS_SCAVENGER_PASSWORD|$NATS_SCAVENGER_PASSWORD|g" \
  -e "s|\\\$NATS_HUNTER_PASSWORD|$NATS_HUNTER_PASSWORD|g" \
  -e "s|\\\$NATS_SENTINEL_PASSWORD|$NATS_SENTINEL_PASSWORD|g" \
  -e "s|\\\$NATS_POWERLAW_PASSWORD|$NATS_POWERLAW_PASSWORD|g" \
  -e "s|\\\$NATS_QUANT_PASSWORD|$NATS_QUANT_PASSWORD|g" \
  -e "s|\\\$NATS_CONSOLE_PASSWORD|$NATS_CONSOLE_PASSWORD|g" \
  "$TEMPLATE_FILE" > "$CONFIG_FILE"

# Verify config was generated
if [ ! -s "$CONFIG_FILE" ]; then
    echo "[NATS-ENTRYPOINT] ERROR: Generated config is empty"
    exit 1
fi

echo "[NATS-ENTRYPOINT] Config generated at $CONFIG_FILE"
echo "[NATS-ENTRYPOINT] Starting NATS server..."

# Execute NATS with the generated config
exec nats-server -c "$CONFIG_FILE" "$@"
