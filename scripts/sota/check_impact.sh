#!/bin/bash
set -euo pipefail
# Impact Analysis / Smart Testing
# Identifies which services have changed and runs tests only for them.

echo "🎯 Running Impact Analysis (Smart Testing)..."

# Get the base branch (default to main or master)
BASE_BRANCH=${1:-origin/main}

# Find changed files
CHANGED_FILES=$(git diff --name-only $BASE_BRANCH)

if [ -z "$CHANGED_FILES" ]; then
  echo "✅ No changes detected."
  exit 0
fi

echo "Changed files:"
echo "$CHANGED_FILES" | head -n 5
if [ $(echo "$CHANGED_FILES" | wc -l) -gt 5 ]; then echo "..."; fi

# Identify affected workspaces
# We assume services are in services/NAME
AFFECTED_SERVICES=$(echo "$CHANGED_FILES" | grep "^services/" | cut -d/ -f2 | sort | uniq)

if [ -z "$AFFECTED_SERVICES" ]; then
  echo "⚠️  Changes detected but no specific service matched. Running all tests..."
  npm test
  exit $?
fi

echo -e "\n📦 Affected Services:"
echo "$AFFECTED_SERVICES"

# Run tests for each affected service
FAILED=0
for SERVICE in $AFFECTED_SERVICES; do
  echo -e "\n🚀 Testing service: $SERVICE"
  npm test -w services/$SERVICE
  if [ $? -ne 0 ]; then
    echo "❌ Test failed for $SERVICE"
    FAILED=1
  fi
done

if [ $FAILED -ne 0 ]; then
  echo "❌ Some tests failed."
  exit 1
else
  echo "✅ All affected tests passed."
  exit 0
fi
