#!/usr/bin/env bash
set -euo pipefail
# scripts/ci/node.sh

source ./scripts/ci/bootstrap.sh

echo "::group::Node.js Services"

# Install Dependencies
if [[ "${1:-}" == "install" ]] || [[ "${1:-}" == "all" ]] || [[ "${1:-}" == "check" ]]; then
  echo "Installing Node dependencies..."
  npm ci
fi

# Lint & Build (Check)
if [[ "${1:-}" == "check" ]]; then
  echo "Running Node lint and build..."
  if npx turbo --version >/dev/null 2>&1; then
    npx turbo run lint build --filter="!//*"
  else
    npm run lint
    npm run build
  fi
fi

# Lint & Test
if [[ "${1:-}" == "test" ]] || [[ "${1:-}" == "all" ]]; then
  # Ensure NATS is running for integration tests
  if ! nc -z localhost 4222 2>/dev/null; then
    echo "Starting NATS (Docker)..."
    docker run -d --name nats_ci -p 4222:4222 -p 8222:8222 nats:2.10.22-alpine -js -m 8222 || true
    # Wait for health
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

  echo "Running Node lint and tests..."
  # Use turbo if available, otherwise npm run
  if npx turbo --version >/dev/null 2>&1; then
    npx turbo run lint test build --filter="!//*" # specific filters can be passed
  else
    npm run lint
    npm run test
    npm run build
  fi

  # GoldenPath E2E Integration Test (Ship Gate)
  echo "Running GoldenPath Integration Test..."
  npx vitest run services/titan-brain/tests/integration/GoldenPath.integration.test.ts --reporter=verbose 2>&1 || {
    echo "::error::GoldenPath Integration Test FAILED - this is a ship gate"
    exit 1
  }
fi

echo "Node.js tasks complete."
echo "::endgroup::"
