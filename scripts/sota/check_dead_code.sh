#!/bin/bash
# Check for dead code, unused exports, and unused files using Knip
echo "🧟‍♂️ Running Dead Code & Unused Export Scan (Knip)..."

# Generate strict report to file
npx knip --no-progress --no-exit-code --reporter json > knip_report.json

# Print human readable summary to stdout
echo "Generating summary..."
npx knip --no-progress --no-exit-code

echo "✅ Dead code scan complete. Report saved to knip_report.json"
