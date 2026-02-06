#!/bin/bash
set -e

echo "📜 Checking Contract Compliance..."

# Work from repo root for proper monorepo resolution
cd "$(dirname "$0")/../.."

echo "  ↳ Installing dependencies..."
npm ci > /dev/null 2>&1

echo "  ↳ Building shared package..."
cd packages/shared
npm run build

echo "  ↳ Generating Schemas & Rust Types..."
# Clean previous artifacts to ensure determinism
# Clean previous artifacts to ensure determinism
# Intentionally only cleaning generated artifacts if needed, but for now relying on overwrite.
# rm -f packages/shared/src/schemas/*.ts <- INCORRECT: This deletes source files!
rm -f packages/shared/schemas/json/*.json
rm -f services/titan-execution-rs/src/contracts/*.rs
npm run generate:schemas
npm run generate:rust

# 2. Check for Drift
echo "  ↳ Verifying git status..."
cd ../..
if [ -n "$(git status --porcelain packages/shared services/titan-execution-rs)" ]; then
  echo "❌ CONTRACT DRIFT DETECTED!"
  echo "   The following files have changed after regeneration:"
  git status --porcelain packages/shared services/titan-execution-rs
  echo ""
  echo "   Please run 'npm run generate:schemas' and 'npm run generate:rust' locally and commit the changes."
  exit 1
fi

echo "✅ Contracts are in sync."
exit 0
