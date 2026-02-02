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
npm run generate:schemas
npm run generate:rust

# 2. Check for Drift
echo "  ↳ Verifying git status..."
cd ../..
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ CONTRACT DRIFT DETECTED!"
  echo "   The following files have changed after regeneration:"
  git status --porcelain
  echo ""
  echo "   Please run 'npm run generate:schemas' and 'npm run generate:rust' locally and commit the changes."
  exit 1
fi

echo "✅ Contracts are in sync."
exit 0
