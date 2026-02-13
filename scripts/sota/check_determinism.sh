#!/bin/bash
set -euo pipefail
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "🔍 Starting Determinism Check..."

# Directory to check (default to all services if not specified)
TARGET_DIR="${1:-services}"

# Temp directories for artifacts
BUILD_1_DIR="/tmp/titan-determinism-build-1"
BUILD_2_DIR="/tmp/titan-determinism-build-2"

# Clean up previous runs
rm -rf "$BUILD_1_DIR" "$BUILD_2_DIR"
mkdir -p "$BUILD_1_DIR" "$BUILD_2_DIR"

cleanup() {
    echo "🧹 Cleaning up intermediate artifacts..."
    # Optional: rm -rf "$BUILD_1_DIR" "$BUILD_2_DIR"
}
trap cleanup EXIT

build_phase() {
    local phase_name=$1
    local output_dir=$2

    echo "🏗️  Phase $phase_name: Cleaning and Building..."
    
    # 1. Clean verify
    npx turbo run clean --force > /dev/null 2>&1 || true
    rm -rf dist build
    find services -name "dist" -type d -exec rm -rf {} +
    find services -name "tsconfig.tsbuildinfo" -delete

    # 2. Build (force no cache)
    npx turbo run build --force --no-cache > /dev/null

    # 3. Collect artifacts
    echo "📦 Phase $phase_name: Collecting artifacts checksums..."
    
    # Find all JS/Map/D.TS files in dist folders and calculate shasum
    # Sort to ensure order doesn't matter for the list itself
    find "$TARGET_DIR" -type f \( -name "*.js" -o -name "*.d.ts" -o -name "*.map" \) -not -path "*/node_modules/*" | sort | xargs shasum -a 256 > "$output_dir/checksums.txt"
}

# Run Build 1
build_phase "1" "$BUILD_1_DIR"

# Run Build 2
build_phase "2" "$BUILD_2_DIR"

# Compare
echo "⚖️  Comparing builds..."

if diff "$BUILD_1_DIR/checksums.txt" "$BUILD_2_DIR/checksums.txt"; then
    echo -e "${GREEN}✅ Build Determinism Verified!${NC}"
    exit 0
else
    echo -e "${RED}❌ Build Determinism Failed!${NC}"
    echo "Diff:"
    diff "$BUILD_1_DIR/checksums.txt" "$BUILD_2_DIR/checksums.txt"
    exit 1
fi
