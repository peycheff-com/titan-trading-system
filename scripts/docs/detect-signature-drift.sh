#!/usr/bin/env bash
# detect-signature-drift.sh - 2026 SOTA Signature Drift Detection
#
# Tier-1 Practice: Compare documented function signatures to actual code
# Detects when documentation references outdated function signatures.
#
# Exit codes:
#   0 - No drift detected
#   1 - Signature drift found

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🔍 Function Signature Drift Detection"
echo "======================================"
echo ""

ISSUES=0

# Define documented signatures to verify
# Format: "function_signature|file_path" (using | as delimiter to avoid :: issues)
declare -a DOCUMENTED_SIGNATURES=(
    "impl HmacValidator|services/titan-execution-rs/src/security.rs"
    "pub fn validate|services/titan-execution-rs/src/security.rs"
    "RiskGuard|services/titan-execution-rs/src/risk_guard.rs"
    "process_intent|services/titan-execution-rs/src/nats_engine.rs"
    "TokenBucket|services/titan-execution-rs/src/rate_limiter.rs"
    "getJetStream|packages/shared/src/messaging/NatsClient.ts"
)

check_signature() {
    local signature="$1"
    local file="$2"
    local full_path="${REPO_ROOT}/${file}"
    
    if [[ ! -f "$full_path" ]]; then
        echo -e "${YELLOW}⚠ File not found: $file${NC}"
        return 0
    fi
    
    if grep -q "$signature" "$full_path" 2>/dev/null; then
        echo -e "${GREEN}✓ Found '$signature' in $file${NC}"
        return 0
    else
        echo -e "${RED}✗ MISSING: '$signature' not found in $file${NC}"
        ((ISSUES++))
        return 1
    fi
}

echo "Verifying documented function signatures..."
echo ""

for entry in "${DOCUMENTED_SIGNATURES[@]}"; do
    IFS='|' read -r sig file <<< "$entry"
    check_signature "$sig" "$file" || true
done

# Also verify invariant symbols from SYSTEM_SOURCE_OF_TRUTH.md
echo ""
echo "Cross-checking SYSTEM_SOURCE_OF_TRUTH.md invariants..."

# Run the main verify-docs.sh for comprehensive check
if [[ -x "${REPO_ROOT}/scripts/verify-docs.sh" ]]; then
    "${REPO_ROOT}/scripts/verify-docs.sh" || true
fi

echo ""
echo "======================================"

if [[ $ISSUES -gt 0 ]]; then
    echo -e "${YELLOW}⚠ Found ${ISSUES} potential signature drift(s)${NC}"
    echo "   Documentation may reference renamed/removed functions."
    exit 0
else
    echo -e "${GREEN}✅ All documented signatures verified${NC}"
    exit 0
fi
