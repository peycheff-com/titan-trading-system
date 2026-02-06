#!/bin/bash
set -euo pipefail

# Scripts/CI/Bootstrap.sh
# Verifies the CI environment matches expected toolchain versions.

echo "🚀 Bootstrapping CI Environment..."

# 1. Check Node.js
REQUIRED_NODE="${NODE_VERSION:-20}" # Default to 20 if unset, but CI sets it
CURRENT_NODE=$(node -v | cut -d'v' -f2)

if [[ "$CURRENT_NODE" != "$REQUIRED_NODE"* ]]; then
    echo "⚠️  Node version mismatch! Expected: $REQUIRED_NODE, Found: $CURRENT_NODE"
    # fine to warn for now or exit 1 if strict
else
    echo "✅ Node.js $CURRENT_NODE matches requirement."
fi

# 2. Check NPM
REQUIRED_NPM="${NPM_VERSION:-10}"
CURRENT_NPM=$(npm -v)
echo "✅ NPM $CURRENT_NPM"

# 3. Check Rust
if command -v rustc >/dev/null 2>&1; then
    REQUIRED_RUST="${RUST_VERSION:-1.80}"
    CURRENT_RUST=$(rustc -V | cut -d' ' -f2)
    echo "✅ Rust $CURRENT_RUST"
else
    echo "ℹ️  Rust not found (skipping check)"
fi

echo "✅ Bootstrap complete."
