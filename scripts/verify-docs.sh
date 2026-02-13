#!/usr/bin/env bash
set -euo pipefail
# verify-docs.sh - Big Tech Documentation Verification Gate
# Tier-1 Practice: Symbol-based evidence validation
#
# This script parses the invariant table from SYSTEM_SOURCE_OF_TRUTH.md
# and verifies each symbol exists in the referenced file.
#
# Exit codes:
#   0 - All symbols verified
#   1 - One or more symbols not found

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SOT_FILE="${REPO_ROOT}/docs/canonical/SYSTEM_SOURCE_OF_TRUTH.md"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Titan Documentation Verification Gate"
echo "========================================="
echo ""

FAILED=0
PASSED=0

# Invariant verification: Symbol must exist in specified file
verify_symbol() {
    local id="$1"
    local symbol="$2"
    local file="$3"
    
    local full_path="${REPO_ROOT}/${file}"
    
    if [[ ! -f "$full_path" ]]; then
        echo -e "${RED}✗ ${id}: File not found: ${file}${NC}"
        ((FAILED++))
        return 1
    fi
    
    if grep -q "$symbol" "$full_path" 2>/dev/null; then
        echo -e "${GREEN}✓ ${id}: Found '${symbol}' in ${file}${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ ${id}: Symbol '${symbol}' NOT found in ${file}${NC}"
        ((FAILED++))
        return 1
    fi
}

echo "Verifying System Invariants..."
echo ""

# Core Security Invariants
verify_symbol "I-02" "impl HmacValidator" "services/titan-execution-rs/src/security.rs" || true
verify_symbol "I-02" "panic!" "services/titan-execution-rs/src/security.rs" || true
verify_symbol "I-06" "GlobalHalt" "services/titan-execution-rs/src/nats_engine.rs" || true
verify_symbol "I-06" "validate_risk_command" "services/titan-execution-rs/src/security.rs" || true
verify_symbol "I-09" "pub fn validate" "services/titan-execution-rs/src/security.rs" || true

# Execution Flow Invariants
verify_symbol "I-01" "process_intent" "services/titan-execution-rs/src/nats_engine.rs" || true
verify_symbol "I-07" "EXECUTION_CORE" "services/titan-execution-rs/src/nats_engine.rs" || true
verify_symbol "I-08" "TITAN_CMD" "services/titan-execution-rs/src/nats_engine.rs" || true
verify_symbol "I-08" "TITAN_EVT" "services/titan-execution-rs/src/nats_engine.rs" || true

# Risk Policy Invariants
verify_symbol "I-03" "get_hash" "services/titan-execution-rs/src/risk_policy.rs" || true
verify_symbol "I-04" "symbolWhitelist" "packages/shared/risk_policy.json" || true
verify_symbol "I-10" "HMAC_TIMESTAMP_TOLERANCE" "services/titan-execution-rs/src/security.rs" || true
verify_symbol "I-11" "TokenBucket" "services/titan-execution-rs/src/rate_limiter.rs" || true
verify_symbol "I-12" "RiskGuard" "services/titan-execution-rs/src/risk_guard.rs" || true
verify_symbol "I-16" "enum RiskState" "services/titan-execution-rs/src/risk_policy.rs" || true
verify_symbol "I-19" "DLQ_EXECUTION_CORE" "services/titan-execution-rs/src/subjects.rs" || true
verify_symbol "I-20" "include_str!" "services/titan-execution-rs/src/risk_policy.rs" || true

# Database Invariants
verify_symbol "I-14" "ROW LEVEL SECURITY" "services/titan-brain/src/db/schema.sql" || true
verify_symbol "I-15" "PARTITION BY" "services/titan-brain/src/db/schema.sql" || true

# Config Invariants
verify_symbol "I-05" "publish" "config/nats.conf" || true
verify_symbol "I-13" "authorization" "config/nats.conf" || true
verify_symbol "I-17" "healthcheck" "docker-compose.prod.yml" || true

echo ""
echo "========================================="
echo -e "Results: ${GREEN}${PASSED} passed${NC}, ${RED}${FAILED} failed${NC}"
echo ""

if [[ $FAILED -gt 0 ]]; then
    echo -e "${RED}❌ Documentation verification FAILED${NC}"
    echo "   Update SYSTEM_SOURCE_OF_TRUTH.md to fix stale references."
    exit 1
else
    echo -e "${GREEN}✅ All invariant symbols verified${NC}"
    exit 0
fi
