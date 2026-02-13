#!/bin/bash
set -euo pipefail
# Usage: ./scripts/rollback.sh [PREVIOUS_TAG]

PREV_TAG=${1:-stable}
echo "⏪ Rolling back to $PREV_TAG..."

export IMAGE_TAG=$PREV_TAG
docker compose -f docker-compose.prod.yml up -d --remove-orphans

echo "✅ Rollback complete. Verifying health..."
docker compose -f docker-compose.prod.yml ps
