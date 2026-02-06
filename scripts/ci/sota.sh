#!/usr/bin/env bash
set -euo pipefail
# scripts/ci/sota.sh

source ./scripts/ci/bootstrap.sh

echo "::group::SOTA Hygiene Checks"

# Run SOTA hygiene checks if available
if [[ -f "./scripts/docs/detect-staleness.sh" ]]; then
  echo "Checking documentation staleness..."
  ./scripts/docs/detect-staleness.sh
fi

if [[ -f "./scripts/docs/validate-codeblocks.sh" ]]; then
  echo "Validating documentation code blocks..."
  ./scripts/docs/validate-codeblocks.sh
fi

# Check for TODOs/Fixmes if we want to enforce zero-debt (optional/warn only for now)
# echo "Checking for critical TODOs..."
# grep -r "TODO(CRITICAL)" . || true

echo "SOTA hygiene checks complete."
echo "::endgroup::"
