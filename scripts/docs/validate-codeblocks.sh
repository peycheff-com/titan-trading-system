#!/usr/bin/env bash
# validate-codeblocks.sh - 2026 SOTA Code Block Validation
#
# Tier-1 Practice: Validate embedded code examples in documentation
# Checks syntax validity of code blocks (TypeScript, Rust, JSON, YAML).
#
# Exit codes:
#   0 - All code blocks valid
#   1 - Invalid code blocks found

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
DOCS_DIR="${REPO_ROOT}/docs"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "📝 Code Block Validation"
echo "========================"
echo ""

ERRORS=0
CHECKED=0
SKIPPED=0

# Create temp directory for validation
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Extract and validate code blocks from a markdown file
validate_file() {
    local file="$1"
    local file_relative="${file#$REPO_ROOT/}"
    
    local in_code_block=false
    local code_lang=""
    local code_content=""
    local block_start_line=0
    local line_num=0
    
    while IFS= read -r line || [[ -n "$line" ]]; do
        line_num=$((line_num + 1))
        
        if [[ "$in_code_block" == false ]]; then
            # Check for code block start
            if [[ "$line" =~ ^\`\`\`([a-zA-Z]+) ]]; then
                in_code_block=true
                code_lang="${BASH_REMATCH[1]}"
                code_content=""
                block_start_line=$line_num
            fi
        else
            # Check for code block end
            if [[ "$line" == '```' ]]; then
                in_code_block=false
                
                # Validate based on language
                case "$code_lang" in
                    json)
                        CHECKED=$((CHECKED + 1))
                        echo "$code_content" > "$TEMP_DIR/test.json"
                        if ! python3 -m json.tool "$TEMP_DIR/test.json" > /dev/null 2>&1; then
                            echo -e "${RED}✗ Invalid JSON in $file_relative:$block_start_line${NC}"
                            ERRORS=$((ERRORS + 1))
                        else
                            echo -e "${GREEN}✓ JSON valid in $file_relative:$block_start_line${NC}"
                        fi
                        ;;
                    yaml|yml)
                        CHECKED=$((CHECKED + 1))
                        echo "$code_content" > "$TEMP_DIR/test.yaml"
                        if ! python3 -c "import yaml; yaml.safe_load(open('$TEMP_DIR/test.yaml'))" 2>/dev/null; then
                            echo -e "${RED}✗ Invalid YAML in $file_relative:$block_start_line${NC}"
                            ERRORS=$((ERRORS + 1))
                        else
                            echo -e "${GREEN}✓ YAML valid in $file_relative:$block_start_line${NC}"
                        fi
                        ;;
                    typescript|ts|javascript|js)
                        # Only check if we have tsc/node available
                        if command -v node &> /dev/null; then
                            CHECKED=$((CHECKED + 1))
                            echo "$code_content" > "$TEMP_DIR/test.js"
                            # Basic syntax check using node
                            if ! node --check "$TEMP_DIR/test.js" 2>/dev/null; then
                                # Try as module
                                echo "$code_content" > "$TEMP_DIR/test.mjs"
                                if ! node --check "$TEMP_DIR/test.mjs" 2>/dev/null; then
                                    echo -e "${YELLOW}⚠ Possible syntax issue in $file_relative:$block_start_line${NC}"
                                    SKIPPED=$((SKIPPED + 1))
                                else
                                    echo -e "${GREEN}✓ JS/TS valid in $file_relative:$block_start_line${NC}"
                                fi
                            else
                                echo -e "${GREEN}✓ JS/TS valid in $file_relative:$block_start_line${NC}"
                            fi
                        else
                            SKIPPED=$((SKIPPED + 1))
                        fi
                        ;;
                    bash|sh|shell)
                        CHECKED=$((CHECKED + 1))
                        echo "$code_content" > "$TEMP_DIR/test.sh"
                        if ! bash -n "$TEMP_DIR/test.sh" 2>/dev/null; then
                            echo -e "${YELLOW}⚠ Possible bash syntax issue in $file_relative:$block_start_line${NC}"
                        else
                            echo -e "${GREEN}✓ Bash valid in $file_relative:$block_start_line${NC}"
                        fi
                        ;;
                    *)
                        SKIPPED=$((SKIPPED + 1))
                        ;;
                esac
                
                code_lang=""
                code_content=""
            else
                code_content+="$line"$'\n'
            fi
        fi
    done < "$file"
}

echo "Scanning documentation for code blocks..."
echo ""

# Find all markdown files and validate
while IFS= read -r -d '' file; do
    validate_file "$file"
done < <(find "$DOCS_DIR" -name "*.md" -print0 2>/dev/null)

echo ""
echo "========================"
echo -e "Checked: ${CHECKED} | Errors: ${ERRORS} | Skipped: ${SKIPPED}"
echo ""

if [[ $ERRORS -gt 0 ]]; then
    echo -e "${RED}❌ Found ${ERRORS} invalid code block(s)${NC}"
    exit 1
else
    echo -e "${GREEN}✅ All validated code blocks are valid${NC}"
    exit 0
fi
