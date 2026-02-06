#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}Starting Documentation Quality Gate...${NC}"

# 1. Existence Check
CRITICAL_DOCS=(
    "docs/canonical/SYSTEM_SOURCE_OF_TRUTH.md"
    "docs/canonical/ARCHITECTURE.md"
    "docs/README.md"
    "docs/index.md"
    "docs/ops/production_deploy.md"
    "docs/risk/risk_policy.md"
)

echo "Checking Critical Files..."
for file in "${CRITICAL_DOCS[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}FAIL: Missing critical doc: $file${NC}"
        exit 1
    fi
done

# 2. Canonical Constancy Check (No "TODO" in canonical)
echo "Checking Cleanliness of Canonical Docs..."
if grep -r "TODO" docs/canonical/; then
    echo -e "${RED}FAIL: Found 'TODO' in canonical documentation via grep.${NC}"
    exit 1
fi

if grep -r "TBD" docs/canonical/; then
    echo -e "${RED}FAIL: Found 'TBD' in canonical documentation via grep.${NC}"
    exit 1
fi

# 3. Pointer Check (Ensure legacy docs point to new ones)
echo "Checking Legacy Pointers..."
LEGACY_POINTERS=(
    "docs/DEPLOYMENT.md"
    "docs/OPERATIONS.md"
    "docs/ARCHITECTURE.md"
)

for file in "${LEGACY_POINTERS[@]}"; do
    if ! grep -q "moved to the canonical location" "$file"; then
        echo -e "${RED}FAIL: Legacy doc $file does not contain redirect notice.${NC}"
        exit 1
    fi
done

echo -e "${GREEN}PASS: Documentation Integrity Verified.${NC}"
exit 0
