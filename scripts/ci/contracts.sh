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

echo "Contract verification complete."
echo "::endgroup::"
