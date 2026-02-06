#!/usr/bin/env bash
set -euo pipefail
# scripts/ci/changed_paths.sh

# Purpose: Centralized logic for determining which CI tiers/jobs to run based on changed files.
# Usage: ./scripts/ci/changed_paths.sh
# Outputs: GitHub Actions compatible outputs (key=value)

source ./scripts/ci/bootstrap.sh

echo "::group::Path Detection"

# Default to true if no git context (e.g. initial run) or if detection fails
CHANGED_NODE=true
CHANGED_RUST=true
CHANGED_DOCS=true
CHANGED_SECURITY=true
CHANGED_CONTRACTS=true
CHANGED_HYGIENE=true
TIER="B" # Default to Tier B (Standard CI)

if [[ -d ".git" ]]; then
  # Determine base ref for diff
  if [[ -n "${GITHUB_BASE_REF:-}" ]]; then
    BASE_REF="origin/${GITHUB_BASE_REF}"
  else
    # Fallback for non-PR events (e.g. push to main)
    # For push events, we want to check against the previous commit
    if [[ -n "${GITHUB_BEFORE:-}" ]] && [[ "${GITHUB_BEFORE}" != "0000000000000000000000000000000000000000" ]]; then
        BASE_REF="${GITHUB_BEFORE}"
    else
        BASE_REF="HEAD^"
    fi
  fi
  
  # Fetch if needed (shallow clones in CI)
  if [[ "${CI:-}" == "true" ]]; then
     # functionality depends on fetch-depth in checkout, assuming it's sufficient or we fetch here
     # In standard actions/checkout, we might need to fetch origin if it's not there
     if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
        echo "Fetching $BASE_REF..."
        git fetch origin "${GITHUB_BASE_REF:-main}" --depth=1 || true
     fi
  fi

  echo "Diffing against: ${BASE_REF}..."
  CHANGED_FILES=$(git diff --name-only "$BASE_REF" HEAD || echo "")
  
  if [[ -z "$CHANGED_FILES" ]]; then
      echo "No files changed detected."
      # Keep defaults or set to false? 
      # If no files changed, usually we don't want to run anything, OR we ran everything just in case.
      # Let's assume false for cost saving, but typically git diff returns empty on first run if invalid ref.
      # However, if it's truly empty, we can skip.
      CHANGED_NODE=false
      CHANGED_RUST=false
      CHANGED_DOCS=false
      CHANGED_SECURITY=false
      CHANGED_CONTRACTS=false
      CHANGED_HYGIENE=false
      TIER="A"
  else
      # 1. DOCS ONLY CHECK
      # If ALL files match docs/md patterns, then we are TIER A (Docs only)
      IS_DOCS_ONLY=true
      while IFS= read -r file; do
        [ -z "$file" ] && continue
        if [[ ! "$file" =~ ^(docs/|README\.md$|mkdocs\.yml$|.*\.md$|site/) ]]; then
            IS_DOCS_ONLY=false
            break
        fi
      done <<< "$CHANGED_FILES"

      if [[ "$IS_DOCS_ONLY" == "true" ]]; then
          echo "Docs-only change detected."
          CHANGED_NODE=false
          CHANGED_RUST=false
          CHANGED_DOCS=true # We still verify docs
          CHANGED_SECURITY=false
          CHANGED_CONTRACTS=false
          CHANGED_HYGIENE=false # Docs verification covers basics
          TIER="A" # Docs Tier
      else
          # Reset defaults for selective running
          CHANGED_NODE=false
          CHANGED_RUST=false
          CHANGED_DOCS=false
          CHANGED_SECURITY=true 
          CHANGED_CONTRACTS=true
          CHANGED_HYGIENE=true
          TIER="B"

          # NODE JS RULES
          # Touching TS/JS/JSON, or CI scripts usually implies Node work
          if echo "$CHANGED_FILES" | grep -qE "(\.ts$|\.js$|\.json$|package\.json|package-lock\.json|yarn\.lock|turbo\.json|apps/|packages/|services/.*(node|js)|scripts/|clients/)"; then
              CHANGED_NODE=true
          fi
          
          # RUST RULES
          # Explicit paths for Rust codebase
          if echo "$CHANGED_FILES" | grep -qE "(services/titan-execution-rs/|rust-toolchain\.toml|Cargo\.toml|Cargo\.lock|packages/shared/scripts/generate-rust\.ts|packages/shared/schemas/json/|scripts/ci/check_contracts\.sh|\.github/workflows/ci\.yml|scripts/ci/rust\.sh)"; then
              CHANGED_RUST=true
          fi

          # If CI config changes, we run everything to be safe
          if echo "$CHANGED_FILES" | grep -qE "(\.github/|scripts/ci/)"; then
              CHANGED_NODE=true
              CHANGED_RUST=true
              CHANGED_SECURITY=true
              CHANGED_CONTRACTS=true
              CHANGED_HYGIENE=true
          fi

          # DOCS (if mixed with code, we verify docs too)
          if echo "$CHANGED_FILES" | grep -qE "(\.md$|docs/)"; then
              CHANGED_DOCS=true
          fi
      fi
  fi
fi

# TIER DEFINITIONS
# Tier A: Docs only, simple checks.
# Tier B: Standard CI (Node/Rust/Security).
# Tier C: Full Matrix / Release (Not outputted here, handled by event type usually, but we can flag)

echo "Summary:"
echo "  Tier:      $TIER"
echo "  Node:      $CHANGED_NODE"
echo "  Rust:      $CHANGED_RUST"
echo "  Docs:      $CHANGED_DOCS"
echo "  Security:  $CHANGED_SECURITY"
echo "  Contracts: $CHANGED_CONTRACTS"
echo "  Hygiene:   $CHANGED_HYGIENE"

# Export outputs for GitHub Actions
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "tier=$TIER" >> "$GITHUB_OUTPUT"
  echo "run_node=$CHANGED_NODE" >> "$GITHUB_OUTPUT"
  echo "run_rust=$CHANGED_RUST" >> "$GITHUB_OUTPUT"
  echo "run_docs=$CHANGED_DOCS" >> "$GITHUB_OUTPUT"
  echo "run_security=$CHANGED_SECURITY" >> "$GITHUB_OUTPUT"
  echo "run_contracts=$CHANGED_CONTRACTS" >> "$GITHUB_OUTPUT"
  echo "run_hygiene=$CHANGED_HYGIENE" >> "$GITHUB_OUTPUT"
fi

echo "::endgroup::"
