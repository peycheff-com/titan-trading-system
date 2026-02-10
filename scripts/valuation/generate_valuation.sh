#!/usr/bin/env bash
# =============================================================================
# Titan IP Valuation - Reproducible Verification Harness
# =============================================================================
# Purpose: Regenerates the complete Audit Evidence Bundle (AEB) from scratch
# Usage:   ./scripts/valuation/generate_valuation.sh
# Output:  valuation/ with all evidence logs, SBOMs, scans, and reports
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ARTIFACTS_DIR="$REPO_ROOT/valuation"
TIMESTAMP=$(TZ="Europe/Sofia" date +"%Y-%m-%dT%H:%M:%S%z")
COMMIT_HASH=$(git -C "$REPO_ROOT" rev-parse HEAD)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Header
echo "============================================================================="
echo "  Titan IP Valuation - Reproducible Verification Harness"
echo "============================================================================="
echo "As-of Date:  $TIMESTAMP (Europe/Sofia)"
echo "Commit:      $COMMIT_HASH"
echo "Output:      $ARTIFACTS_DIR"
echo "============================================================================="
echo ""

# Create artifacts directory structure
log_info "Creating artifacts directory structure..."
mkdir -p "$ARTIFACTS_DIR"/{logs,sbom,scans,snapshots,reports,schemas}

# =============================================================================
# Phase 1: Environment Fingerprint
# =============================================================================
log_info "[1/9] Capturing environment fingerprint..."

ENV_FILE="$ARTIFACTS_DIR/logs/environment.json"
{
  echo "{"
  echo "  \"timestamp\": \"$TIMESTAMP\","
  echo "  \"commit\": \"$COMMIT_HASH\","
  echo "  \"node\": \"$(node --version 2>/dev/null || echo 'not installed')\","
  echo "  \"npm\": \"$(npm --version 2>/dev/null || echo 'not installed')\","
  echo "  \"rustc\": \"$(rustc --version 2>/dev/null || echo 'not installed')\","
  echo "  \"cargo\": \"$(cargo --version 2>/dev/null || echo 'not installed')\","
  echo "  \"python\": \"$(python3 --version 2>/dev/null || echo 'not installed')\","
  echo "  \"os\": \"$(uname -s) $(uname -r)\","
  echo "  \"arch\": \"$(uname -m)\""
  echo "}"
} > "$ENV_FILE"
log_success "Environment fingerprint saved to logs/environment.json"

# =============================================================================
# Phase 2: Codebase Metrics
# =============================================================================
log_info "[2/9] Collecting codebase metrics..."

METRICS_FILE="$ARTIFACTS_DIR/reports/codebase_metrics.json"
cd "$REPO_ROOT"

# Count TypeScript files and lines
TS_FILES=$(find . -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" -not -name "*.d.ts" | wc -l | tr -d ' ')
TS_SLOC=$(find . -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" -not -name "*.d.ts" -exec cat {} \; 2>/dev/null | wc -l | tr -d ' ')
TS_TEST_FILES=$(find . -name "*.test.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" | wc -l | tr -d ' ')

# Count Rust files and lines
RS_FILES=$(find . -name "*.rs" -not -path "*/target/*" | wc -l | tr -d ' ')
RS_SLOC=$(find . -name "*.rs" -not -path "*/target/*" -exec cat {} \; 2>/dev/null | wc -l | tr -d ' ')

# Count services
SERVICE_COUNT=$(ls -d services/*/ 2>/dev/null | wc -l | tr -d ' ')

{
  echo "{"
  echo "  \"asOfDate\": \"$TIMESTAMP\","
  echo "  \"commitHash\": \"$COMMIT_HASH\","
  echo "  \"typescript\": {"
  echo "    \"files\": $TS_FILES,"
  echo "    \"sloc\": $TS_SLOC,"
  echo "    \"testFiles\": $TS_TEST_FILES"
  echo "  },"
  echo "  \"rust\": {"
  echo "    \"files\": $RS_FILES,"
  echo "    \"sloc\": $RS_SLOC"
  echo "  },"
  echo "  \"services\": {"
  echo "    \"count\": $SERVICE_COUNT,"
  echo "    \"list\": ["
  first=true
  for svc in services/*/; do
    svc_name=$(basename "$svc")
    if [ "$first" = true ]; then
      first=false
    else
      echo ","
    fi
    echo -n "      \"$svc_name\""
  done
  echo ""
  echo "    ]"
  echo "  },"
  echo "  \"coverage\": {"
  echo "    \"sentinel\": 80.57,"
  echo "    \"hunter\": 84.37,"
  echo "    \"brain\": 85.9,"
  echo "    \"aiQuant\": 80.0,"
  echo "    \"note\": \"Coverage values from Jan 2026 coverage drive\""
  echo "  }"
  echo "}"
} > "$METRICS_FILE"
log_success "Codebase metrics saved to reports/codebase_metrics.json"

# =============================================================================
# Phase 3: SBOM Generation (CycloneDX)
# =============================================================================
log_info "[3/9] Generating SBOM (CycloneDX format)..."

SBOM_LOG="$ARTIFACTS_DIR/logs/sbom.log"
SBOM_FILE="$ARTIFACTS_DIR/sbom/sbom.json"

if npm run sota:sbom -- --output-file "$SBOM_FILE" > "$SBOM_LOG" 2>&1; then
  log_success "SBOM generated at sbom/sbom.json"
else
  log_warn "SBOM generation had issues - check logs/sbom.log"
fi

# =============================================================================
# Phase 4: Dependency Vulnerability Scans
# =============================================================================
log_info "[4/9] Running dependency vulnerability scans..."

# NPM Audit
NPM_AUDIT_FILE="$ARTIFACTS_DIR/scans/npm_audit.json"
npm audit --json > "$NPM_AUDIT_FILE" 2>&1 || true
log_success "NPM audit saved to scans/npm_audit.json"

# Cargo Audit (if available)
CARGO_AUDIT_FILE="$ARTIFACTS_DIR/scans/cargo_audit.json"
if command -v cargo-audit &> /dev/null; then
  (cd services/titan-execution-rs && cargo audit --json > "$CARGO_AUDIT_FILE" 2>&1) || true
  log_success "Cargo audit saved to scans/cargo_audit.json"
else
  echo '{"error": "cargo-audit not installed"}' > "$CARGO_AUDIT_FILE"
  log_warn "cargo-audit not installed - skipping Rust vulnerability scan"
fi

# =============================================================================
# Phase 5: Static Analysis
# =============================================================================
log_info "[5/9] Running static analysis..."

# ESLint
LINT_LOG="$ARTIFACTS_DIR/logs/lint.log"
npm run lint:all > "$LINT_LOG" 2>&1 || true
log_success "ESLint output saved to logs/lint.log"

# Clippy
CLIPPY_LOG="$ARTIFACTS_DIR/logs/clippy.log"
(cd services/titan-execution-rs && cargo clippy --message-format=json > "$CLIPPY_LOG" 2>&1) || true
log_success "Clippy output saved to logs/clippy.log"

# =============================================================================
# Phase 6: Secrets Scan
# =============================================================================
log_info "[6/9] Running secrets scan..."

SECRETS_LOG="$ARTIFACTS_DIR/logs/secrets_scan.log"
npm run sota:secrets > "$SECRETS_LOG" 2>&1 || true
log_success "Secrets scan saved to logs/secrets_scan.log"

# =============================================================================
# Phase 7: Test Suite Execution
# =============================================================================
log_info "[7/9] Running test suites (this may take several minutes)..."

# TypeScript tests
TS_TEST_LOG="$ARTIFACTS_DIR/logs/typescript_tests.log"
npm run test:all > "$TS_TEST_LOG" 2>&1 || true
log_success "TypeScript test results saved to logs/typescript_tests.log"

# Rust tests
RS_TEST_LOG="$ARTIFACTS_DIR/logs/rust_tests.log"
(cd services/titan-execution-rs && cargo test 2>&1 | tee "$RS_TEST_LOG") || true
log_success "Rust test results saved to logs/rust_tests.log"

# =============================================================================
# Phase 8: SOTA Suite
# =============================================================================
log_info "[8/9] Running full SOTA quality suite..."

SOTA_LOG="$ARTIFACTS_DIR/logs/sota_all.log"
# Run individual checks to capture granular results
{
  echo "=== SOTA Circular Dependencies ===" 
  npm run sota:circular 2>&1 || true
  echo ""
  echo "=== SOTA Architecture ===" 
  npm run sota:arch 2>&1 || true
  echo ""
  echo "=== SOTA Complexity ===" 
  npm run sota:complexity 2>&1 || true
  echo ""
  echo "=== SOTA God Classes ===" 
  npm run sota:god 2>&1 || true
  echo ""
  echo "=== SOTA Dead Code ===" 
  npm run sota:dead 2>&1 || true
  echo ""
  echo "=== SOTA Zombie Dependencies ===" 
  npm run sota:zombie 2>&1 || true
  echo ""
  echo "=== SOTA TypeCheck ===" 
  npm run sota:typecheck 2>&1 || true
  echo ""
  echo "=== SOTA Rust Format ===" 
  npm run sota:rust:fmt 2>&1 || true
} > "$SOTA_LOG"
log_success "SOTA suite output saved to logs/sota_all.log"

# =============================================================================
# Phase 9: Generate Manifest
# =============================================================================
log_info "[9/9] Generating evidence manifest with SHA-256 hashes..."

MANIFEST_FILE="$ARTIFACTS_DIR/MANIFEST.sha256"
cd "$ARTIFACTS_DIR"
find . -type f -not -name "MANIFEST.sha256" -exec sha256sum {} \; | sort > "$MANIFEST_FILE"
log_success "Manifest generated at MANIFEST.sha256"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================================================================="
echo "  Valuation Evidence Collection Complete"
echo "============================================================================="
echo "Artifacts Directory: $ARTIFACTS_DIR"
echo ""
echo "Evidence Categories:"
echo "  - logs/         : Build logs, test outputs, environment fingerprint"
echo "  - sbom/         : Software Bill of Materials (CycloneDX)"
echo "  - scans/        : Vulnerability scan results"
echo "  - snapshots/    : Web evidence snapshots (to be populated)"
echo "  - reports/      : Codebase metrics and valuation reports"
echo "  - schemas/      : JSON schemas for validation"
echo ""
echo "Next Steps:"
echo "  1. Capture regulatory web snapshots (EU AI Act, DORA, NIST)"
echo "  2. Populate claim_ledger.json with evidence pointers"
echo "  3. Calculate valuation math in valuation_report.md"
echo "  4. Package AEB.zip for delivery"
echo "============================================================================="
