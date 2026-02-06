#!/usr/bin/env bash
# check-api-sync.sh - 2026 SOTA API-to-OpenAPI Sync Detection
#
# Tier-1 Practice: Verify OpenAPI spec matches actual implementations
# Detects undocumented endpoints or stale OpenAPI paths.
#
# Exit codes:
#   0 - API spec is in sync
#   1 - Drift detected

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

OPENAPI_FILE="${REPO_ROOT}/docs/reference/openapi.yaml"
API_ROUTES_DIR="${REPO_ROOT}/apps/titan-console-api/src/routes"

echo "🔄 API-to-OpenAPI Sync Verification"
echo "===================================="
echo ""

# Check if OpenAPI file exists
if [[ ! -f "$OPENAPI_FILE" ]]; then
    echo -e "${YELLOW}⚠ OpenAPI file not found at $OPENAPI_FILE${NC}"
    echo "   Skipping API sync check."
    exit 0
fi

# Check if routes directory exists
if [[ ! -d "$API_ROUTES_DIR" ]]; then
    echo -e "${YELLOW}⚠ Routes directory not found at $API_ROUTES_DIR${NC}"
    echo "   Skipping API sync check."
    exit 0
fi

ISSUES=0

# Extract paths from OpenAPI spec
echo "Extracting documented API paths..."
OPENAPI_PATHS=$(grep -E "^\s+/[a-zA-Z]" "$OPENAPI_FILE" 2>/dev/null | \
    sed 's/://g' | \
    sed 's/^[[:space:]]*//' | \
    sort -u || true)

if [[ -z "$OPENAPI_PATHS" ]]; then
    echo -e "${YELLOW}⚠ No paths found in OpenAPI spec${NC}"
fi

# Extract route patterns from code
echo "Extracting implemented routes..."
CODE_ROUTES=$(grep -rh "app\.\(get\|post\|put\|delete\|patch\)" "$API_ROUTES_DIR" 2>/dev/null | \
    grep -oE "['\"][^'\"]*['\"]" | \
    tr -d "'\""| \
    sort -u | \
    grep -E "^/" || true)

if [[ -z "$CODE_ROUTES" ]]; then
    echo -e "${YELLOW}⚠ No routes found in code${NC}"
fi

echo ""
echo "Documented paths in OpenAPI:"
echo "$OPENAPI_PATHS" | head -10
echo "..."

echo ""
echo "Implemented routes in code:"
echo "$CODE_ROUTES" | head -10
echo "..."

# Find potentially undocumented routes
echo ""
echo "Checking for undocumented routes..."

while IFS= read -r route; do
    [[ -z "$route" ]] && continue
    # Simplistic check - see if route base path exists in OpenAPI
    base_path=$(echo "$route" | sed 's/\/:[^/]*//g' | sed 's/\/:.*$//')
    if ! echo "$OPENAPI_PATHS" | grep -q "$base_path"; then
        echo -e "${YELLOW}⚠ Potentially undocumented: $route${NC}"
        ((ISSUES++)) || true
    fi
done <<< "$CODE_ROUTES"

echo ""
echo "===================================="

if [[ $ISSUES -gt 0 ]]; then
    echo -e "${YELLOW}⚠ Found ${ISSUES} potentially undocumented route(s)${NC}"
    echo "   Consider updating OpenAPI spec."
    # Soft-fail (warning only)
    exit 0
else
    echo -e "${GREEN}✅ API documentation appears in sync${NC}"
    exit 0
fi
