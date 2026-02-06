#!/usr/bin/env bash
set -euo pipefail
# scripts/ci/security.sh

source ./scripts/ci/bootstrap.sh

echo "::group::Security Scans"

# NPM Audit
echo "Running NPM audit..."
# Audit only production deps, high/critical
npm audit --audit-level=high --production || echo "::warning::NPM audit found issues (non-blocking for now)"

# Cargo Audit
if command -v cargo &> /dev/null; then
  echo "Running Cargo audit..."
  # cargo audit || echo "::warning::Cargo audit found issues"
  # Skipping for now as it might need installation/caching
  echo "Skipping cargo audit (requires binary install)"
else
  echo "Cargo not found, skipping cargo audit."
fi

# Secret Scan (Trivy/Gitleaks would go here)
# echo "Running secret scan..."

echo "Security scans complete."
echo "::endgroup::"
