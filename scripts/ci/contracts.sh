#!/usr/bin/env bash
set -euo pipefail
# scripts/ci/contracts.sh

source ./scripts/ci/bootstrap.sh

echo "::group::Contract Verification"

# Check for check-api-sync or similar scripts
if [[ -f "./scripts/docs/check-api-sync.sh" ]]; then
  echo "Verifying API <-> OpenAPI sync..."
  ./scripts/docs/check-api-sync.sh
fi

if [[ -f "./scripts/docs/detect-signature-drift.sh" ]]; then
   echo "Verifying signature drift..."
   ./scripts/docs/detect-signature-drift.sh
fi

# ── Phase 1 Hard Gates ──────────────────────────────────────────────────────

# 1. TS ↔ Rust subject catalog sync (HARD GATE)
echo "Verifying TS ↔ Rust subject catalog sync..."
./scripts/ci/verify_subjects_sync.sh

# 2. Subject canon enforcement — no raw subject strings outside canonical source
echo "Verifying subject canon enforcement..."
./scripts/ci/check_subjects.sh

# 3. Contract tests — schema compliance, consumer rejection, well-formedness
echo "Running contract tests..."
npx jest --selectProjects contract --passWithNoTests

echo "Contract verification complete."
echo "::endgroup::"

