#!/bin/bash
# =============================================================================
# 07_rollback.sh - Rollback wrapper with additional safety
# =============================================================================
# Enhanced wrapper around the main rollback.sh with extra confirmation.
# Usage: ./07_rollback.sh [version]
# =============================================================================

set -euo pipefail

TITAN_ROOT="/opt/titan"
ROLLBACK_SCRIPT="${TITAN_ROOT}/current/scripts/ops/rollback.sh"

RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║                    EMERGENCY ROLLBACK                      ║${NC}"
echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Show current deployment info
echo "Current deployment:"
if [ -L "${TITAN_ROOT}/current" ]; then
    CURRENT=$(readlink "${TITAN_ROOT}/current")
    echo "  -> ${CURRENT}"
else
    echo "  -> No current deployment symlink found"
fi
echo ""

# Show available releases
echo "Available releases:"
ls -lt "${TITAN_ROOT}/releases" 2>/dev/null | head -5 || echo "  No releases found"
echo ""

# Confirmation
echo -e "${YELLOW}This will:${NC}"
echo "  1. Send HARD_HALT to stop all trading"
echo "  2. Stop application services"
echo "  3. Rollback to previous release (or specified version)"
echo "  4. Restart services in safe order"
echo ""

read -p "Type 'ROLLBACK' to confirm: " CONFIRM
if [ "$CONFIRM" != "ROLLBACK" ]; then
    echo "Aborted."
    exit 1
fi

# Check for rollback script
if [ ! -f "$ROLLBACK_SCRIPT" ]; then
    echo "ERROR: Rollback script not found at ${ROLLBACK_SCRIPT}"
    echo "Fallback: manually switch symlink and restart"
    exit 1
fi

# Execute rollback
VERSION="${1:-}"
if [ -n "$VERSION" ]; then
    exec bash "$ROLLBACK_SCRIPT" "$VERSION"
else
    exec bash "$ROLLBACK_SCRIPT"
fi
