#!/usr/bin/env bash
set -euo pipefail
# scripts/ci/rust.sh

source ./scripts/ci/bootstrap.sh

echo "::group::Rust Services"

# Check if cargo is available
if ! command -v cargo &> /dev/null; then
  echo "Cargo not found. Skipping Rust checks."
  exit 0
fi

# Locate Cargo Workspace
if [[ -f "Cargo.toml" ]]; then
  echo "Found Cargo.toml in root."
elif [[ -d "services/titan-execution-rs" ]]; then
  echo "Changing directory to services/titan-execution-rs..."
  cd services/titan-execution-rs
else
  echo "Error: Could not locate Cargo.toml or services/titan-execution-rs"
  exit 1
fi

# Build & Test
if [[ "${1:-}" == "all" ]]; then
    echo "Running cargo fmt check..."
    cargo fmt --all -- --check

    echo "Running cargo clippy..."
    cargo clippy --all-targets --all-features -- -D warnings

    # Ensure NATS is running for tests
    if ! nc -z localhost 4222 2>/dev/null; then
      echo "Starting NATS (Docker)..."
      docker run -d --name nats_ci -p 4222:4222 -p 8222:8222 nats:2.10.22-alpine -js -m 8222 || true
      echo "Waiting for NATS..."
      for i in {1..30}; do
        if curl -s http://localhost:8222/varz >/dev/null; then
          echo "NATS is up."
          break
        fi
        sleep 1
      done
    else
      echo "NATS is already running."
    fi

    echo "Running cargo test..."
    cargo test --all
fi

echo "Rust tasks complete."
echo "::endgroup::"
