#!/bin/bash
set -e

# Define root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUST_SERVICE_DIR="$ROOT_DIR/services/titan-execution-rs"
OUTPUT_DIR="$ROOT_DIR/artifacts/valuation/coverage/rust"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

echo "🦀 Generating Rust Code Coverage for Titan Execution Engine..."
echo "📂 Service: $RUST_SERVICE_DIR"
echo "📂 Output: $OUTPUT_DIR"

# Check if cargo-tarpaulin is installed
if ! command -v cargo-tarpaulin &> /dev/null; then
    echo "❌ cargo-tarpaulin is not installed. Please run 'cargo install cargo-tarpaulin'."
    exit 1
fi

# Navigate to Rust service directory
cd "$RUST_SERVICE_DIR"

# Run tarpaulin
# - --out Xml: Generate Cobertura XML for machine parsing
# - --out Html: Generate HTML for human review
# - --output-dir: Where to save reports
# - --ignore-tests: Don't count test code itself in coverage
cargo tarpaulin \
    --out Xml \
    --out Html \
    --output-dir "$OUTPUT_DIR" \
    --ignore-tests \
    --verbose

echo "✅ Rust Coverage Generation Complete!"
echo "📄 Report: $OUTPUT_DIR/tarpaulin-report.html"
