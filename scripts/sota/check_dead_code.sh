#!/bin/bash
set -euo pipefail
# Check for dead code, unused exports, and unused files using Knip
echo "🧟‍♂️ Running Dead Code & Unused Export Scan (Knip)..."

# Generate strict report to file
npx knip --no-progress --no-exit-code --reporter json > knip_report.json

# Print human readable summary to stdout
echo "Generating summary..."
# Print human readable summary to stdout
echo "Generating summary..."
KNIP_MAX=${KNIP_MAX_ISSUES:-0}
if npx knip --no-progress --max-issues "$KNIP_MAX"; then
    echo "✅ knip passed (max-issues=$KNIP_MAX)."
else
    echo "❌ knip failed (issues > $KNIP_MAX)."
    exit 1
fi

echo "✅ Dead code scan complete. Report saved to knip_report.json"
