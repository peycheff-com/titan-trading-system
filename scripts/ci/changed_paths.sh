#!/usr/bin/env bash
set -euo pipefail
# scripts/ci/changed_paths.sh

source ./scripts/ci/bootstrap.sh

echo "::group::Path Detection"

# Default to true if no git context (e.g. initial run)
CHANGED_RUST=true
CHANGED_TS=true
CHANGED_DOCS=true
CHANGED_CI=true

if [[ -d ".git" ]]; then
  # Determine base ref for diff
  if [[ -n "${GITHUB_BASE_REF:-}" ]]; then
    BASE_REF="origin/${GITHUB_BASE_REF}"
  else
    BASE_REF="HEAD^"
  fi
  
  # Fetch if needed (shallow clones in CI)
  if [[ "${CI:-}" == "true" ]]; then
     git fetch origin "${GITHUB_BASE_REF:-main}" --depth=1 || true
  fi

  CHANGED_FILES=$(git diff --name-only "$BASE_REF" HEAD || echo "")
  
  if echo "$CHANGED_FILES" | grep -qE "(\.rs$|Cargo\.toml|Cargo\.lock)"; then
    CHANGED_RUST=true
  else
    CHANGED_RUST=false
  fi

  if echo "$CHANGED_FILES" | grep -qE "(\.ts$|\.js$|\.json$|package\.json|package-lock\.json)"; then
    CHANGED_TS=true
  else
    CHANGED_TS=false
  fi
  
  if echo "$CHANGED_FILES" | grep -qE "(\.md$|docs/)"; then
    CHANGED_DOCS=true
  else
    CHANGED_DOCS=false
  fi
  
   if echo "$CHANGED_FILES" | grep -qE "(\.github/|scripts/ci/)"; then
    CHANGED_CI=true
  else
    CHANGED_CI=false
  fi
fi

# Export outputs for GitHub Actions
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "rust=$CHANGED_RUST" >> "$GITHUB_OUTPUT"
  echo "ts=$CHANGED_TS" >> "$GITHUB_OUTPUT"
  echo "docs=$CHANGED_DOCS" >> "$GITHUB_OUTPUT"
  echo "ci=$CHANGED_CI" >> "$GITHUB_OUTPUT"
fi

echo "Summary:"
echo "  Rust: $CHANGED_RUST"
echo "  TS:   $CHANGED_TS"
echo "  Docs: $CHANGED_DOCS"
echo "  CI:   $CHANGED_CI"

echo "::endgroup::"
