#!/usr/bin/env bash
set -euo pipefail

# scripts/ci/local-ci.sh
# Local CI parity script — runs the same checks as ci.yml
#
# Usage:  ./scripts/ci/local-ci.sh [--skip-rust]
#
# Required versions (must match ci.yml):
#   Node 22.19.0  |  npm 11.6.2  |  Rust 1.89.0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

SKIP_RUST=false
for arg in "$@"; do
  [[ "$arg" == "--skip-rust" ]] && SKIP_RUST=true
done

# ── Version Check ──────────────────────────────────────────────────
echo "=== Version Check ==="
EXPECTED_NODE="v22.19.0"
EXPECTED_NPM="11.6.2"
EXPECTED_RUST="1.89.0"

ACTUAL_NODE="$(node --version 2>/dev/null || echo 'missing')"
ACTUAL_NPM="$(npm --version 2>/dev/null || echo 'missing')"

if [[ "$ACTUAL_NODE" != "$EXPECTED_NODE" ]]; then
  echo "⚠️  Node version mismatch: have $ACTUAL_NODE, CI uses $EXPECTED_NODE"
fi
if [[ "$ACTUAL_NPM" != "$EXPECTED_NPM" ]]; then
  echo "⚠️  npm version mismatch: have $ACTUAL_NPM, CI uses $EXPECTED_NPM"
fi
if [[ "$SKIP_RUST" == false ]]; then
  ACTUAL_RUST="$(rustc --version 2>/dev/null | awk '{print $2}' || echo 'missing')"
  if [[ "$ACTUAL_RUST" != "$EXPECTED_RUST" ]]; then
    echo "⚠️  Rust version mismatch: have $ACTUAL_RUST, CI uses $EXPECTED_RUST"
  fi
fi

START=$(date +%s)

# ── Step 1: Preflight ──────────────────────────────────────────────
echo ""
echo "=== Step 1/5: Preflight (config, contracts, SOTA) ==="
STEP_START=$(date +%s)
bash "$SCRIPT_DIR/config_validate.sh" || true
bash "$SCRIPT_DIR/contracts.sh" || true
bash "$SCRIPT_DIR/sota.sh" || true
echo "  ⏱  Preflight: $(( $(date +%s) - STEP_START ))s"

# ── Step 2: Node — lint, build, test ───────────────────────────────
echo ""
echo "=== Step 2/5: Node Services ==="
STEP_START=$(date +%s)
bash "$SCRIPT_DIR/node.sh" all
echo "  ⏱  Node: $(( $(date +%s) - STEP_START ))s"

# ── Step 3: Rust — fmt, clippy, test ──────────────────────────────
if [[ "$SKIP_RUST" == false ]]; then
  echo ""
  echo "=== Step 3/5: Rust Services ==="
  STEP_START=$(date +%s)
  bash "$SCRIPT_DIR/rust.sh" all
  echo "  ⏱  Rust: $(( $(date +%s) - STEP_START ))s"
else
  echo ""
  echo "=== Step 3/5: Rust Services (SKIPPED) ==="
fi

# ── Step 4: Security ──────────────────────────────────────────────
echo ""
echo "=== Step 4/5: Security Scan ==="
STEP_START=$(date +%s)
bash "$SCRIPT_DIR/security.sh" || true
echo "  ⏱  Security: $(( $(date +%s) - STEP_START ))s"

# ── Step 5: Summary ───────────────────────────────────────────────
TOTAL=$(( $(date +%s) - START ))
echo ""
echo "========================================"
echo "  Local CI complete in ${TOTAL}s"
echo "========================================"
