#!/bin/bash
set -euo pipefail

# Scripts/CI/Node.sh
# Standardized entrypoint for Node.js CI tasks

COMMAND="${1:-test}"
BASE_REF="${DiffBase:-origin/main}" # Default diff base

echo "📦 Node.js CI: Running $COMMAND"

# Ensure dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm ci
fi

# Determine filter
FILTER=""
if [ -n "${GITHUB_BASE_REF:-}" ]; then
    # PR Context
    FILTER="--filter=...[origin/${GITHUB_BASE_REF}...HEAD]"
    echo "🔎 PR Context: Filtering for changed packages ($FILTER)"
else
    echo "🌍 Full Run: No filter applied"
fi

case "$COMMAND" in
    "build")
        npx turbo run build $FILTER
        ;;
    "lint")
        npx turbo run lint $FILTER
        ;;
    "test")
        npx turbo run test --filter=!titan-execution-rs $FILTER
        ;;
    "all")
        npx turbo run build lint test --filter=!titan-execution-rs $FILTER
        ;;
    *)
        echo "❌ Unknown command: $COMMAND"
        exit 1
        ;;
esac

echo "✅ Node.js CI $COMMAND complete."
