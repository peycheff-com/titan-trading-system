#!/bin/bash
set -e

# Configuration
GOLDEN_INPUT="golden_dataset.jsonl"
GOLDEN_OUTPUT="golden_output.json"
ACTUAL_OUTPUT="actual_output_$(date +%s).json"

echo "🧪 Starting Regression Suite..."

# 1. Ensure Input Dataset exists
if [ ! -f "$GOLDEN_INPUT" ]; then
    echo "⚠️ $GOLDEN_INPUT not found. Generating new dataset..."
    cargo run --bin generate_golden -- --output "$GOLDEN_INPUT" --scenarios 200
else
    echo "✅ Using existing $GOLDEN_INPUT"
fi

# 2. Run Replay
echo "▶️ Running Replay..."
cargo run --quiet --bin replay_cli -- "$GOLDEN_INPUT" "$ACTUAL_OUTPUT"

# 3. Compare Results
if [ ! -f "$GOLDEN_OUTPUT" ]; then
    echo "⚠️ No baseline found ($GOLDEN_OUTPUT). Saving current run as baseline."
    cp "$ACTUAL_OUTPUT" "$GOLDEN_OUTPUT"
    echo "✅ Baseline saved."
else
    echo "🔍 Comparing outputs..."
    if diff -q "$GOLDEN_OUTPUT" "$ACTUAL_OUTPUT"; then
        echo "✅ PASS: Replay output matches golden baseline."
        rm "$ACTUAL_OUTPUT"
    else
        echo "❌ FAIL: Output mismatch!"
        echo "Diff:"
        diff "$GOLDEN_OUTPUT" "$ACTUAL_OUTPUT" | head -n 20
        exit 1
    fi
fi

echo "🎉 Regression Suite Completed Successfully."
