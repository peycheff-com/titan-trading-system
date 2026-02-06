#!/bin/bash
set -euo pipefail

# Scripts/CI/Rust.sh
# Standardized entrypoint for Rust CI tasks

COMMAND="${1:-test}"
WORKDIR="services/titan-execution-rs"

echo "🦀 Rust CI: Running $COMMAND"

if [ ! -d "$WORKDIR" ]; then
    echo "❌ Rust directory $WORKDIR not found!"
    exit 1
fi

cd "$WORKDIR"

case "$COMMAND" in
    "fmt")
        cargo fmt -- --check
        ;;
    "clippy")
        cargo clippy -- -D warnings
        ;;
    "test")
        # Ensure NATS is up if needed (mock check)
        if ! curl -s http://localhost:8222/varz >/dev/null; then
             echo "⚠️  NATS likely not running, tests might fail if they require it."
        fi
        cargo test
        ;;
    "build")
        cargo build --release
        ;;
    "all")
        cargo fmt -- --check
        cargo clippy -- -D warnings
        cargo test
        cargo build --release
        ;;
    *)
        echo "❌ Unknown command: $COMMAND"
        exit 1
        ;;
esac

echo "✅ Rust CI $COMMAND complete."
