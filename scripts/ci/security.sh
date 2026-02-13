#!/usr/bin/env bash
set -euo pipefail
# scripts/ci/security.sh

source ./scripts/ci/bootstrap.sh

echo "::group::Security Scans"

# NPM Audit
echo "Running NPM audit..."
npm audit --audit-level=high --production || {
  echo "::error::NPM audit found high/critical vulnerabilities"
  exit 1
}

# Cargo Audit
if command -v cargo &> /dev/null; then
  echo "Installing cargo-audit..."
  cargo install cargo-audit --locked 2>/dev/null || true
  echo "Running Cargo audit..."
  (cd services/titan-execution-rs && cargo audit) || {
    echo "::error::Cargo audit found vulnerabilities"
    exit 1
  }
else
  echo "Cargo not found, skipping cargo audit."
fi

# Secret Scan (Trivy/Gitleaks would go here)
# echo "Running secret scan..."

echo "Security scans complete."
echo "::endgroup::"
