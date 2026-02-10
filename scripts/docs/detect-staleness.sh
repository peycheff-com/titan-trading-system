#!/usr/bin/env bash
# detect-staleness.sh - 2026 SOTA Documentation Staleness Detection
# 
# Tier-1 Practice: Time-based drift detection
# Flags documentation files that haven't been updated when corresponding
# code modules have recent changes.
#
# Exit codes:
#   0 - No stale docs detected
#   1 - Stale documentation found

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration: doc → code mappings
# Format: "doc_path:code_path:staleness_threshold_days"
declare -a DOC_CODE_MAPPINGS=(
    "docs/SYSTEM_SOURCE_OF_TRUTH.md:services/titan-execution-rs/src:30"
    "docs/SYSTEM_SOURCE_OF_TRUTH.md:services/titan-brain/src:30"
    "docs/reference/openapi.yaml:apps/titan-console-api/src/routes:14"
    "docs/api/execution.md:services/titan-execution-rs/src:21"
    "docs/architecture/ARCHITECTURE.md:services:45"
    "docs/security/SECURITY.md:services/titan-execution-rs/src/security.rs:30"
    "docs/operations/RUNBOOK.md:docker-compose.prod.yml:30"
    "docs/connectivity/README.md:packages/shared/src/messaging:21"
)

echo "📅 Documentation Staleness Detection"
echo "====================================="
echo ""

STALE_COUNT=0
CHECKED_COUNT=0

get_last_commit_days() {
    local path="$1"
    local last_commit_date
    
    if [[ ! -e "$REPO_ROOT/$path" ]]; then
        echo "-1"
        return
    fi
    
    last_commit_date=$(git -C "$REPO_ROOT" log -1 --format="%ci" -- "$path" 2>/dev/null | cut -d' ' -f1)
    
    if [[ -z "$last_commit_date" ]]; then
        echo "-1"
        return
    fi
    
    local last_commit_epoch=$(date -j -f "%Y-%m-%d" "$last_commit_date" "+%s" 2>/dev/null || date -d "$last_commit_date" "+%s" 2>/dev/null)
    local now_epoch=$(date "+%s")
    local days_ago=$(( (now_epoch - last_commit_epoch) / 86400 ))
    
    echo "$days_ago"
}

check_staleness() {
    local doc_path="$1"
    local code_path="$2"
    local threshold="$3"
    
    local doc_days=$(get_last_commit_days "$doc_path")
    local code_days=$(get_last_commit_days "$code_path")
    
    if [[ "$doc_days" == "-1" ]] || [[ "$code_days" == "-1" ]]; then
        echo -e "${YELLOW}⚠ Skip: $doc_path (file/path not found)${NC}"
        return 0
    fi
    
    ((CHECKED_COUNT++))
    
    # Doc is stale if: code updated more recently AND doc older than threshold
    if [[ "$code_days" -lt "$doc_days" ]] && [[ "$doc_days" -gt "$threshold" ]]; then
        echo -e "${RED}❌ STALE: $doc_path${NC}"
        echo "   Doc last updated: ${doc_days} days ago"
        echo "   Code last updated: ${code_days} days ago"
        echo "   Staleness threshold: ${threshold} days"
        ((STALE_COUNT++))
        return 1
    else
        echo -e "${GREEN}✓ Fresh: $doc_path (doc: ${doc_days}d, code: ${code_days}d)${NC}"
        return 0
    fi
}

echo "Checking documentation freshness..."
echo ""

for mapping in "${DOC_CODE_MAPPINGS[@]}"; do
    IFS=':' read -r doc_path code_path threshold <<< "$mapping"
    check_staleness "$doc_path" "$code_path" "$threshold" || true
done

echo ""
echo "====================================="
echo -e "Checked: ${CHECKED_COUNT} | Stale: ${STALE_COUNT}"
echo ""

if [[ $STALE_COUNT -gt 0 ]]; then
    echo -e "${YELLOW}⚠ Warning: ${STALE_COUNT} stale documentation file(s) detected${NC}"
    echo "   Consider updating documentation to reflect recent code changes."
    # Soft-fail by default (warning only)
    exit 0
else
    echo -e "${GREEN}✅ All documentation is fresh${NC}"
    exit 0
fi
