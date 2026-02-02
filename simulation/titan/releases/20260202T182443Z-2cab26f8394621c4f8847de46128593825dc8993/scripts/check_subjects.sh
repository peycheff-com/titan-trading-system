#!/bin/bash
set -e

# Subject Canon Enforcement Script
# Pattern: Detects raw usage of 'titan.cmd.', 'titan.evt.', 'titan.data.', 'titan.sys.' or 'titan.signal.'
# Excludes: titan_subjects.ts (Canonical Source) and powerlaw_subjects.ts (Legacy Shim)

echo "🔍 Scanning for raw NATS subject strings (Subject Canon Enforcement)..."

# Define patterns to search for
PATTERNS="titan\.cmd\.|titan\.evt\.|titan\.data\.|titan\.sys\.|titan\.signal\.|TITAN\.|titan\.cmd\.execute\."

# Define exclusions (grep arguments)
# We exclude node_modules, dist, builds, and the canonical definition files
EXCLUDES="--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build --exclude-dir=coverage --exclude-dir=logs --exclude-dir=.jest-cache --exclude-dir=.next --exclude-dir=.turbo --exclude-dir=target --exclude-dir=tests --exclude=titan_subjects.ts --exclude=powerlaw_subjects.ts --exclude=check_subjects.sh --exclude=NatsClient.ts --exclude=package.json --exclude=package-lock.json --exclude=yarn.lock --exclude=*.md --exclude=benchmark_nats_latency.mjs --exclude=*.txt --exclude=*.log --exclude=simulate_execution.js --exclude=subjects.rs"

# Run grep
# We search in packages/ and services/
# Filter out comments (//, *, /*)
# Note: we use colon separator to distinguish content from filename in grep output
if grep -rE "$PATTERNS" packages services $EXCLUDES | grep -vE ":[[:space:]]*//" | grep -vE ":[[:space:]]*\*" | grep -vE ":[[:space:]]*/\*"; then
    echo ""
    echo "❌ FATAL: Raw NATS subject strings detected!"
    echo "   All subjects MUST be imported from '@titan/shared' (TITAN_SUBJECTS)."
    echo "   See packages/shared/src/messaging/titan_subjects.ts"
    exit 1
else
    echo "✅ No raw subject strings found. Canon is enforced."
    exit 0
fi
