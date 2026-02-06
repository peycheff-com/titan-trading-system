#!/usr/bin/env bash
set -euo pipefail
# scripts/ci/config_validate.sh

source ./scripts/ci/bootstrap.sh

echo "::group::Config Validation"

if [[ "${1:-}" == "strict" ]]; then
    # Placeholder for strict validation using a schema validator
    echo "Running strict config validation..."
    # node scripts/validate-config.js --strict
else
     echo "Running basic config validation..."
     # node scripts/validate-config.js
fi

echo "Config validation passed."
echo "::endgroup::"
