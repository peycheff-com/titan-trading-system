#!/usr/bin/env bash
# console-guardrails.sh
#
# Permanent CI guard against legacy API resurgence, redundancy, and dead code.
# Run from repo root: ./scripts/console-guardrails.sh
#
# Exit codes:
#   0 = all checks pass
#   1 = one or more guardrail violations

set -euo pipefail

CONSOLE_SRC="apps/titan-console/src"
FAIL=0

echo "🔒 Console Guardrails — checking legacy API resurgence & code hygiene"
echo "======================================================================="

# ─────────────────────────────────────────────────────────────
# 1. No references to getTitanExecutionUrl
# ─────────────────────────────────────────────────────────────
echo ""
echo "▶ Check 1: No getTitanExecutionUrl references"
if grep -rn "getTitanExecutionUrl" "$CONSOLE_SRC" 2>/dev/null; then
  echo "❌ FAIL: getTitanExecutionUrl found — use getTitanBrainUrl instead"
  FAIL=1
else
  echo "✅ PASS"
fi

# ─────────────────────────────────────────────────────────────
# 2. No hardcoded localhost URLs (except in test files & config)
# ─────────────────────────────────────────────────────────────
echo ""
echo "▶ Check 2: No hardcoded localhost URLs (excluding tests & config)"
LOCALHOST_HITS=$(grep -rn "localhost:3002\|localhost:3001\|localhost:8080" "$CONSOLE_SRC" \
  --include='*.ts' --include='*.tsx' \
  --exclude='*.test.*' --exclude='*.spec.*' \
  --exclude='api-config.ts' 2>/dev/null || true)

if [ -n "$LOCALHOST_HITS" ]; then
  echo "$LOCALHOST_HITS"
  echo "❌ FAIL: Hardcoded localhost URLs found — use api-config.ts helpers"
  FAIL=1
else
  echo "✅ PASS"
fi

# ─────────────────────────────────────────────────────────────
# 3. No featureFlags imports
# ─────────────────────────────────────────────────────────────
echo ""
echo "▶ Check 3: No featureFlags imports"
if grep -rn "featureFlags" "$CONSOLE_SRC" 2>/dev/null; then
  echo "❌ FAIL: featureFlags reference found — file was deleted"
  FAIL=1
else
  echo "✅ PASS"
fi

# ─────────────────────────────────────────────────────────────
# 4. No VITE_TITAN_EXECUTION_URL usage outside api-config.ts
# ─────────────────────────────────────────────────────────────
echo ""
echo "▶ Check 4: No VITE_TITAN_EXECUTION_URL outside api-config"
ENV_HITS=$(grep -rn "VITE_TITAN_EXECUTION_URL" "$CONSOLE_SRC" \
  --include='*.ts' --include='*.tsx' \
  --exclude='api-config.ts' 2>/dev/null || true)

if [ -n "$ENV_HITS" ]; then
  echo "$ENV_HITS"
  echo "❌ FAIL: Direct VITE_TITAN_EXECUTION_URL reference — use getTitanBrainUrl()"
  FAIL=1
else
  echo "✅ PASS"
fi

# ─────────────────────────────────────────────────────────────
# 5. No duplicate operator intent route registrations
# ─────────────────────────────────────────────────────────────
echo ""
echo "▶ Check 5: No duplicate operator intent route registrations"
BRAIN_SRC="services/titan-brain/src"
if [ -d "$BRAIN_SRC" ]; then
  ROUTE_DUPES=$(grep -rn "\.get\('/operator/intents'\|\.post\('/operator/intents'" "$BRAIN_SRC" \
    --include='*.ts' 2>/dev/null | sort | uniq -d || true)
  if [ -n "$ROUTE_DUPES" ]; then
    echo "$ROUTE_DUPES"
    echo "❌ FAIL: Duplicate route registrations found"
    FAIL=1
  else
    echo "✅ PASS"
  fi
else
  echo "⊘ SKIP: Brain service not found at $BRAIN_SRC"
fi

# ─────────────────────────────────────────────────────────────
# 6. Unused exports check (via knip)
# ─────────────────────────────────────────────────────────────
echo ""
echo "▶ Check 6: Unused exports (knip)"
if command -v npx &> /dev/null; then
  KNIP_OUTPUT=$(npx knip --no-progress --include exports 2>&1 || true)
  KNIP_COUNT=$(echo "$KNIP_OUTPUT" | grep -c "unused" || echo "0")
  # Ensure KNIP_COUNT is a clean integer
  KNIP_COUNT=$(echo "$KNIP_COUNT" | tr -d '[:space:]' | head -1)
  KNIP_COUNT=${KNIP_COUNT:-0}
  if [ "$KNIP_COUNT" -gt 20 ] 2>/dev/null; then
    echo "$KNIP_OUTPUT" | head -30
    echo "❌ FAIL: More than 20 unused exports detected (found ~$KNIP_COUNT)"
    FAIL=1
  else
    echo "✅ PASS (found $KNIP_COUNT unused, threshold: 20)"
  fi
else
  echo "⊘ SKIP: npx not available"
fi

# ─────────────────────────────────────────────────────────────
# 7. Unused dependencies check (via depcheck)
# ─────────────────────────────────────────────────────────────
echo ""
echo "▶ Check 7: Unused dependencies (depcheck)"
if command -v npx &> /dev/null; then
  DEPCHECK_OUTPUT=$(npx depcheck --json 2>/dev/null || true)
  if [ -n "$DEPCHECK_OUTPUT" ]; then
    UNUSED_DEPS=$(echo "$DEPCHECK_OUTPUT" | node -e "
      const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const deps = data.dependencies || [];
      console.log(deps.length);
    " 2>/dev/null || echo "0")
    if [ "$UNUSED_DEPS" -gt 5 ]; then
      echo "$DEPCHECK_OUTPUT" | head -20
      echo "❌ FAIL: More than 5 unused dependencies (found $UNUSED_DEPS)"
      FAIL=1
    else
      echo "✅ PASS (found $UNUSED_DEPS unused, threshold: 5)"
    fi
  else
    echo "⊘ SKIP: depcheck returned no output"
  fi
else
  echo "⊘ SKIP: npx not available"
fi

echo ""
echo "======================================================================="
if [ $FAIL -eq 0 ]; then
  echo "✅ All guardrails passed"
else
  echo "❌ Guardrail violations detected — fix before merging"
  exit 1
fi
