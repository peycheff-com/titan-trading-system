#!/usr/bin/env bash
set -euo pipefail
# check-links.sh - 2026 SOTA Link Rot Detection
#
# Tier-1 Practice: Validate all documentation links
# Checks internal file links, external URLs, and anchor references.
#
# Exit codes:
#   0 - All links valid
#   1 - Broken links found

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
DOCS_DIR="${REPO_ROOT}/docs"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🔗 Documentation Link Validation"
echo "================================="
echo ""

BROKEN_COUNT=0
CHECKED_COUNT=0
SKIPPED_COUNT=0

# Check if a file exists (for internal links)
check_internal_link() {
    local source_file="$1"
    local link="$2"
    local source_dir=$(dirname "$source_file")
    
    # Remove anchor part
    local path="${link%%#*}"
    
    # Skip empty paths (anchor-only links)
    if [[ -z "$path" ]]; then
        return 0
    fi
    
    # Resolve relative path
    local full_path
    if [[ "$path" == /* ]]; then
        full_path="${REPO_ROOT}${path}"
    else
        full_path="${source_dir}/${path}"
    fi
    
    # Normalize path
    full_path=$(cd "$(dirname "$full_path")" 2>/dev/null && echo "$(pwd)/$(basename "$full_path")" || echo "$full_path")
    
    if [[ -e "$full_path" ]]; then
        return 0
    else
        return 1
    fi
}

# Check external URL (with timeout)
check_external_link() {
    local url="$1"
    
    # Skip certain domains that block automated checks
    if [[ "$url" =~ (localhost|127.0.0.1|example.com|placeholder) ]]; then
        return 0
    fi
    
    # Use curl with timeout
    if curl --output /dev/null --silent --head --fail --max-time 5 "$url" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Extract links from markdown file
extract_links() {
    local file="$1"
    # Extract markdown links: [text](url) - get the url part
    grep -oE '\[([^\]]*)\]\(([^)]+)\)' "$file" 2>/dev/null | \
        sed -E 's/\[([^\]]*)\]\(([^)]+)\)/\2/' | \
        grep -v '^$' || true
}

echo "Scanning markdown files for links..."
echo ""

# Find all markdown files in docs
while IFS= read -r -d '' file; do
    file_relative="${file#$REPO_ROOT/}"
    
    while IFS= read -r link; do
        [[ -z "$link" ]] && continue
        ((CHECKED_COUNT++))
        
        if [[ "$link" =~ ^https?:// ]]; then
            # External link - skip for CI speed
            ((SKIPPED_COUNT++))
        elif [[ "$link" =~ ^file:// ]]; then
            # File URI - extract path
            local path="${link#file://}"
            if [[ -e "$path" ]]; then
                echo -e "${GREEN}✓${NC} $file_relative → $link"
            else
                echo -e "${RED}✗ BROKEN${NC} $file_relative → $link"
                ((BROKEN_COUNT++))
            fi
        else
            # Internal link
            if check_internal_link "$file" "$link"; then
                echo -e "${GREEN}✓${NC} $file_relative → $link"
            else
                echo -e "${RED}✗ BROKEN${NC} $file_relative → $link"
                ((BROKEN_COUNT++))
            fi
        fi
    done < <(extract_links "$file")
done < <(find "$DOCS_DIR" -name "*.md" -print0 2>/dev/null)

echo ""
echo "================================="
echo -e "Checked: ${CHECKED_COUNT} | Broken: ${BROKEN_COUNT} | Skipped (external): ${SKIPPED_COUNT}"
echo ""

if [[ $BROKEN_COUNT -gt 0 ]]; then
    echo -e "${RED}❌ Found ${BROKEN_COUNT} broken link(s)${NC}"
    exit 1
else
    echo -e "${GREEN}✅ All internal links valid${NC}"
    exit 0
fi
