#!/bin/bash
# check_config_readiness.sh
# Verifies config system readiness by checking:
# 1. All required env vars are set or have defaults
# 2. Config registry is initialized correctly
# 3. Database tables exist (if using persistence)
# Returns 0 on success, 1 on failure

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_CATALOG="$BRAIN_DIR/src/services/config/ConfigRegistry.ts"

echo "═══════════════════════════════════════════════════════════════"
echo "  Titan Configuration Readiness Check"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Track issues
WARNINGS=0
ERRORS=0

#
# 1. Check that ConfigRegistry exists and has required methods
#
echo "1. Checking ConfigRegistry structure..."
if [ -f "$CONFIG_CATALOG" ]; then
    # Check for required methods
    REQUIRED_METHODS=("getCatalog" "getEffectiveValue" "createOverride" "rollbackOverride" "getReceipts" "getActiveOverrides")
    MISSING_METHODS=""
    
    for method in "${REQUIRED_METHODS[@]}"; do
        if ! grep -q "$method" "$CONFIG_CATALOG"; then
            MISSING_METHODS="$MISSING_METHODS $method"
            ((ERRORS++))
        fi
    done
    
    if [ -n "$MISSING_METHODS" ]; then
        echo "   ❌ Missing methods:$MISSING_METHODS"
    else
        echo "   ✓ All required methods present"
    fi
else
    echo "   ❌ ConfigRegistry not found at: $CONFIG_CATALOG"
    ((ERRORS++))
fi

#
# 2. Check critical environment variables
#
echo ""
echo "2. Checking critical environment variables..."

CRITICAL_VARS=("HMAC_SECRET")
OPTIONAL_VARS=("DATABASE_URL" "NATS_URL" "REDIS_URL")

for var in "${CRITICAL_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo "   ⚠ CRITICAL: $var is not set (required for config signing)"
        ((WARNINGS++))
    else
        echo "   ✓ $var is set"
    fi
done

for var in "${OPTIONAL_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo "   ○ OPTIONAL: $var not set (will use defaults)"
    else
        echo "   ✓ $var is set"
    fi
done

#
# 3. Check config catalog completeness
#
echo ""
echo "3. Checking config catalog completeness..."

# Extract config keys and count them
CONFIG_COUNT=$(grep -c "category:" "$CONFIG_CATALOG" 2>/dev/null || true)
CONFIG_COUNT="${CONFIG_COUNT:-0}"
if [ "$CONFIG_COUNT" -gt 0 ]; then
    echo "   ✓ Config catalog contains $CONFIG_COUNT config items"
else
    echo "   ❌ No config items found in catalog"
    ((ERRORS++))
fi

# Check for each category
CATEGORIES=("risk" "capital" "nats" "redis" "postgres" "feature" "system")
for cat in "${CATEGORIES[@]}"; do
    CAT_COUNT=$(grep -c "category: \"$cat\"" "$CONFIG_CATALOG" 2>/dev/null || true)
    CAT_COUNT="${CAT_COUNT:-0}"
    if [ "$CAT_COUNT" -gt 0 ] 2>/dev/null; then
        echo "   ✓ Category '$cat': $CAT_COUNT items"
    else
        echo "   ○ Category '$cat': no items"
    fi
done

#
# 4. Check tighten-only enforcement is properly configured
#
echo ""
echo "4. Checking safety rules configuration..."

TIGHTEN_ONLY=$(grep -c 'behavior: "tighten_only"' "$CONFIG_CATALOG" 2>/dev/null || true)
TIGHTEN_ONLY="${TIGHTEN_ONLY:-0}"
RAISE_ONLY=$(grep -c 'behavior: "raise_only"' "$CONFIG_CATALOG" 2>/dev/null || true)
RAISE_ONLY="${RAISE_ONLY:-0}"
IMMUTABLE=$(grep -c 'behavior: "immutable"' "$CONFIG_CATALOG" 2>/dev/null || true)
IMMUTABLE="${IMMUTABLE:-0}"

echo "   ✓ Tighten-only configs: $TIGHTEN_ONLY"
echo "   ✓ Raise-only configs: $RAISE_ONLY"
echo "   ✓ Immutable configs: $IMMUTABLE"

if [ "${TIGHTEN_ONLY:-0}" -eq 0 ] 2>/dev/null && [ "${RAISE_ONLY:-0}" -eq 0 ] 2>/dev/null; then
    echo "   ⚠ No safety-constrained configs found - review risk configs"
    ((WARNINGS++))
fi

#
# 5. Check database schema (if DATABASE_URL is set)
#
echo ""
echo "5. Checking database readiness..."

if [ -n "$DATABASE_URL" ]; then
    echo "   Checking PostgreSQL tables..."
    
    # Check if tables exist using pg_isready or similar
    if command -v psql &> /dev/null; then
        TABLES=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('config_overrides', 'config_receipts');" 2>/dev/null || echo "0")
        if [ "$TABLES" -ge 2 ]; then
            echo "   ✓ Config tables exist in database"
        else
            echo "   ⚠ Config tables may not exist (found: $TABLES/2)"
            ((WARNINGS++))
        fi
    else
        echo "   ○ psql not available - skipping database check"
    fi
else
    echo "   ○ DATABASE_URL not set - using in-memory storage"
fi

#
# Summary
#
echo ""
echo "═══════════════════════════════════════════════════════════════"
if [ $ERRORS -gt 0 ]; then
    echo "  FAILED: $ERRORS errors, $WARNINGS warnings"
    echo "═══════════════════════════════════════════════════════════════"
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo "  PASSED WITH WARNINGS: $WARNINGS warnings"
    echo "═══════════════════════════════════════════════════════════════"
    exit 0
else
    echo "  PASSED: All checks successful"
    echo "═══════════════════════════════════════════════════════════════"
    exit 0
fi
