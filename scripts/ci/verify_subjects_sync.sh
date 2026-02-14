#!/bin/bash
set -euo pipefail
# =============================================================================
# verify_subjects_sync.sh — Cross-check Rust ↔ TypeScript subject catalogs
# =============================================================================
# Extracts subject strings from:
#   - services/titan-execution-rs/src/subjects.rs    (Rust)
#   - packages/shared/src/messaging/titan_subjects.ts (TypeScript)
# And verifies they are consistent.
#
# Usage: ./scripts/ci/verify_subjects_sync.sh
# =============================================================================

RUST_FILE="services/titan-execution-rs/src/subjects.rs"
TS_FILE="packages/shared/src/messaging/titan_subjects.ts"

echo "🔍 Verifying NATS subject sync between Rust and TypeScript..."

if [ ! -f "$RUST_FILE" ]; then
    echo "❌ Rust subjects file not found: $RUST_FILE"
    exit 1
fi

if [ ! -f "$TS_FILE" ]; then
    echo "❌ TypeScript subjects file not found: $TS_FILE"
    exit 1
fi

# Extract subject strings from Rust (lines like: pub const X: &str = "titan.xxx";)
RUST_SUBJECTS=$(grep -o "\"titan\.[^\"]*\"" "$RUST_FILE" | tr -d '"' | sort -u)

# Extract subject strings from TypeScript (both string literals and template prefixes)
TS_SUBJECTS=$(grep -o "'titan\.[^']*'" "$TS_FILE" | tr -d "'" | sort -u)

echo ""
echo "📊 Rust subjects:      $(echo "$RUST_SUBJECTS" | wc -l | tr -d ' ')"
echo "📊 TypeScript subjects: $(echo "$TS_SUBJECTS" | wc -l | tr -d ' ')"

# Subjects in Rust but not in TypeScript
RUST_ONLY=$(comm -23 <(echo "$RUST_SUBJECTS") <(echo "$TS_SUBJECTS"))
# Subjects in TypeScript but not in Rust (informational only — TS is superset)
TS_ONLY=$(comm -13 <(echo "$RUST_SUBJECTS") <(echo "$TS_SUBJECTS"))

ERRORS=0

if [ -n "$RUST_ONLY" ]; then
    echo ""
    echo "⚠️  Subjects in Rust but NOT in TypeScript:"
    echo "$RUST_ONLY" | while read -r subj; do
        echo "    - $subj"
    done
    ERRORS=$((ERRORS + 1))
fi

if [ -n "$TS_ONLY" ]; then
    echo ""
    echo "ℹ️  Subjects in TypeScript but not in Rust (informational):"
    echo "$TS_ONLY" | while read -r subj; do
        echo "    - $subj"
    done
fi

echo ""
if [ $ERRORS -gt 0 ]; then
    echo "❌ SYNC MISMATCH: Rust subjects exist that are not in TypeScript."
    echo "   Either add them to titan_subjects.ts or remove from subjects.rs."
    exit 1
else
    echo "✅ All Rust subjects are present in TypeScript catalog."
    exit 0
fi
