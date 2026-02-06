#!/usr/bin/env bash
set -euo pipefail
# scripts/ci/status_gate.sh

source ./scripts/ci/bootstrap.sh

echo "::group::Status Gate"
echo "Verifying Job Statuses..."

# Map of Job Name -> Status (passed via ENV)
declare -A JOBS
JOBS=(
  ["preflight"]="${STATUS_PREFLIGHT:-skipped}"
  ["node-services"]="${STATUS_NODE:-skipped}"
  ["rust-services"]="${STATUS_RUST:-skipped}"
  ["security-scan"]="${STATUS_SECURITY:-skipped}"
)

FAILED=false
SKIPPED_CRITICAL=false

# 2026 Invariant: "No Skip" logic can be enforced here if we know what *should* have run.
# For now, we replicate the "fail on failure/cancelled" logic.

for job in "${!JOBS[@]}"; do
  status="${JOBS[$job]}"
  if [[ "$status" == "failure" ]] || [[ "$status" == "cancelled" ]]; then
    echo "❌ $job failed or cancelled (status: $status)"
    FAILED=true
  elif [[ "$status" == "skipped" ]]; then
     echo "⚠️ $job was skipped"
     # Future: if implicit dependency required it, set SKIPPED_CRITICAL=true
  else
     echo "✅ $job passed"
  fi
done

if [[ "$FAILED" == "true" ]]; then
  echo "::error::Pipeline failed due to job failures."
  exit 1
fi

echo "✅ All checked jobs passed."
echo "::endgroup::"
