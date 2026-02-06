#!/usr/bin/env bash
set -euo pipefail

# scripts/ci/bootstrap.sh
# Canonical bootstrap for all CI jobs.
# Enforces strict mode, prints versions, and validates workspace.

echo "::group::CI Bootstrap"
echo "Starting CI Bootstrap..."
date -u

# 1. Validate Shell Environment
if [[ -z "${BASH_VERSION:-}" ]]; then
  echo "Error: This script must be run with bash."
  exit 1
fi

# 2. Export Common Environment Variables
export CI=true
export FORCE_COLOR=1
export NODE_OPTIONS="--max-old-space-size=4096"

# 3. Print Toolchain Versions
echo "--- Toolchain Versions ---"
echo "Node: $(node --version 2>/dev/null || echo 'Not installed')"
echo "NPM: $(npm --version 2>/dev/null || echo 'Not installed')"
echo "Rust: $(rustc --version 2>/dev/null || echo 'Not installed')"
echo "Cargo: $(cargo --version 2>/dev/null || echo 'Not installed')"
echo "Go: $(go version 2>/dev/null || echo 'Not installed')"
echo "Docker: $(docker --version 2>/dev/null || echo 'Not installed')"
echo "--------------------------"

# 4. Validate Workspace
if [[ ! -f "package.json" ]]; then
  echo "Error: package.json not found. Must run from repo root."
  exit 1
fi

echo "Bootstrap complete."
echo "::endgroup::"
