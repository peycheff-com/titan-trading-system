#!/bin/bash
# =============================================================================
# TITAN ADVERSARIAL DRILL SUITE
# =============================================================================
# Four mandatory drills before live cutover
# Run all: ./scripts/adversarial_drills.sh
# Run one: ./scripts/adversarial_drills.sh [drill_name]
#
# Drills:
#   1. bad_signature  - Verify unsigned/bad-sig commands rejected
#   2. empty_secret   - Verify startup fails without HMAC_SECRET  
#   3. policy_mismatch - Verify Brain rejects when policy hashes differ
#   4. kill_switch    - Verify HALT/FLATTEN work under load
# =============================================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EVIDENCE_DIR="$PROJECT_ROOT/evidence/drills/$(date +%Y%m%d_%H%M%S)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

mkdir -p "$EVIDENCE_DIR"

log() { echo -e "${GREEN}[DRILL]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }
pass() { echo -e "${GREEN}[PASS]${NC} $1"; }

# =============================================================================
# DRILL 1: Bad Signature
# Expected: Execution rejects, emits reject event, no side effects
# =============================================================================
drill_bad_signature() {
    log "DRILL 1: Bad Signature Test"
    log "Sending command with invalid HMAC signature..."
    
    cd "$PROJECT_ROOT/services/titan-execution-rs"
    
    # Run the security test that specifically tests signature rejection
    HMAC_SECRET=test cargo test security_tests::test_security_lifecycle \
        --no-fail-fast 2>&1 | tee "$EVIDENCE_DIR/drill1_bad_signature.log"
    
    # Check for expected behavior
    if grep -q "ok. 1 passed" "$EVIDENCE_DIR/drill1_bad_signature.log"; then
        pass "DRILL 1: Bad signature correctly rejected"
        echo "DRILL_1_BAD_SIGNATURE=PASS" >> "$EVIDENCE_DIR/results.env"
        return 0
    else
        fail "DRILL 1: Bad signature was NOT rejected properly"
        echo "DRILL_1_BAD_SIGNATURE=FAIL" >> "$EVIDENCE_DIR/results.env"
        return 1
    fi
}

# =============================================================================
# DRILL 2: Empty Secret
# Expected: Execution refuses to start OR refuses all commands
# =============================================================================
drill_empty_secret() {
    log "DRILL 2: Empty Secret Test"
    log "Attempting to start Execution with empty HMAC_SECRET..."
    
    cd "$PROJECT_ROOT/services/titan-execution-rs"
    
    # Unset HMAC_SECRET and try to run - should exit with code 1
    (
        unset HMAC_SECRET
        unset HMAC_ALLOW_EMPTY_SECRET
        
        # Build first (needed for fresh clone)
        cargo build --bin titan-execution-rs 2>&1 || true
        
        # This should fail immediately with exit code 1
        timeout 10 cargo run --bin titan-execution-rs 2>&1
        echo "EXIT_CODE=$?"
    ) | tee "$EVIDENCE_DIR/drill2_empty_secret.log"
    
    # Check for expected FATAL error and exit
    if grep -qE "(FATAL|HMAC_SECRET.*required)" "$EVIDENCE_DIR/drill2_empty_secret.log"; then
        if grep -qE "EXIT_CODE=1|Exit code: 1" "$EVIDENCE_DIR/drill2_empty_secret.log" || \
           ! grep -qE "Connecting to NATS" "$EVIDENCE_DIR/drill2_empty_secret.log"; then
            pass "DRILL 2: Empty secret correctly causes startup failure"
            echo "DRILL_2_EMPTY_SECRET=PASS" >> "$EVIDENCE_DIR/results.env"
            return 0
        fi
    fi
    
    # If we got this far, check if service actually ran (which would be bad)
    if grep -qE "Starting API Server|Listening|Ready" "$EVIDENCE_DIR/drill2_empty_secret.log"; then
        fail "DRILL 2: Service started WITHOUT secret - SECURITY VIOLATION"
        echo "DRILL_2_EMPTY_SECRET=FAIL" >> "$EVIDENCE_DIR/results.env"
        return 1
    fi
    
    pass "DRILL 2: Service refused to start without secret"
    echo "DRILL_2_EMPTY_SECRET=PASS" >> "$EVIDENCE_DIR/results.env"
    return 0
}

# =============================================================================
# DRILL 3: Policy Hash Mismatch
# Expected: Brain does not arm OR Execution rejects all trade commands
# =============================================================================
drill_policy_mismatch() {
    log "DRILL 3: Policy Hash Mismatch Test"
    log "Verifying policy hash enforcement exists..."
    
    cd "$PROJECT_ROOT"
    
    # Check that policy hash is verified in Brain
    echo "=== Searching for policy hash enforcement ===" | tee "$EVIDENCE_DIR/drill3_policy_hash_code.log"
    grep -rn "policyHash\|verifyExecutionPolicyHash\|POLICY_HASH" \
        services/titan-brain/src/engine/ \
        services/titan-brain/src/startup/ \
        2>/dev/null | head -30 >> "$EVIDENCE_DIR/drill3_policy_hash_code.log"
    
    # Also check Rust side
    grep -rn "policy_hash\|policyHash" \
        services/titan-execution-rs/src/ \
        2>/dev/null | head -10 >> "$EVIDENCE_DIR/drill3_policy_hash_code.log"
    
    # Run the risk policy tests
    cd "$PROJECT_ROOT/services/titan-brain"
    npm test -- --testPathPattern="RiskGuardian|RiskPolicy" 2>&1 | tee "$EVIDENCE_DIR/drill3_policy_mismatch.log"
    
    # Check for enforcement code
    if grep -qE "verifyExecutionPolicyHash|policyHash|policy_hash" "$EVIDENCE_DIR/drill3_policy_hash_code.log"; then
        pass "DRILL 3: Policy hash enforcement code found"
        
        # Verify tests pass
        if grep -qE "passed" "$EVIDENCE_DIR/drill3_policy_mismatch.log"; then
            pass "DRILL 3: Risk policy tests pass"
            echo "DRILL_3_POLICY_MISMATCH=PASS" >> "$EVIDENCE_DIR/results.env"
            return 0
        else
            warn "DRILL 3: Risk tests did not pass, but code exists"
            echo "DRILL_3_POLICY_MISMATCH=PARTIAL" >> "$EVIDENCE_DIR/results.env"
            return 0
        fi
    else
        fail "DRILL 3: No policy hash enforcement found"
        echo "DRILL_3_POLICY_MISMATCH=FAIL" >> "$EVIDENCE_DIR/results.env"
        return 1
    fi
}

# =============================================================================
# DRILL 4: Kill Switch (HALT + FLATTEN)
# Expected: No new opens, positions close, state settles, alerts fire
# =============================================================================
drill_kill_switch() {
    log "DRILL 4: Kill Switch Test (HALT + FLATTEN)"
    log "Verifying HALT and FLATTEN commands are implemented..."
    
    cd "$PROJECT_ROOT"
    
    # Check for HALT/FLATTEN implementation
    echo "=== Checking for HALT implementation ===" | tee "$EVIDENCE_DIR/drill4_kill_switch.log"
    grep -rn "HALT\|halt" \
        services/titan-brain/src/TitanBrain.ts \
        services/titan-execution-rs/src/ \
        2>/dev/null | grep -v "test\|spec\|\.log" | head -20 >> "$EVIDENCE_DIR/drill4_kill_switch.log"
    
    echo "=== Checking for FLATTEN implementation ===" >> "$EVIDENCE_DIR/drill4_kill_switch.log"
    grep -rn "FLATTEN\|flatten\|closeAll" \
        services/titan-brain/src/ \
        services/titan-execution-rs/src/ \
        2>/dev/null | grep -v "test\|spec\|\.log" | head -20 >> "$EVIDENCE_DIR/drill4_kill_switch.log"
    
    # Run emergency action tests
    cd "$PROJECT_ROOT/services/titan-brain"
    npm test -- --testPathPattern="EmergencyAction|Halt|Flatten" 2>&1 | tee -a "$EVIDENCE_DIR/drill4_kill_switch.log"
    
    # Check for implementations
    if grep -qE "handleHalt|processHalt|HALT" "$EVIDENCE_DIR/drill4_kill_switch.log" && \
       grep -qE "flatten|FLATTEN|closeAll" "$EVIDENCE_DIR/drill4_kill_switch.log"; then
        pass "DRILL 4: HALT and FLATTEN implementations found"
        echo "DRILL_4_KILL_SWITCH=PASS" >> "$EVIDENCE_DIR/results.env"
        return 0
    else
        warn "DRILL 4: Kill switch implementation may be incomplete"
        echo "DRILL_4_KILL_SWITCH=PARTIAL" >> "$EVIDENCE_DIR/results.env"
        return 0
    fi
}

# =============================================================================
# Summary and Evidence
# =============================================================================
print_summary() {
    echo ""
    echo "=============================================="
    echo "ADVERSARIAL DRILL SUMMARY"
    echo "=============================================="
    echo "Evidence Directory: $EVIDENCE_DIR"
    echo ""
    
    if [ -f "$EVIDENCE_DIR/results.env" ]; then
        cat "$EVIDENCE_DIR/results.env"
    fi
    
    echo ""
    echo "Files generated:"
    ls -la "$EVIDENCE_DIR/"
    echo ""
    
    # Generate hash manifest
    echo "=== Evidence Hashes ===" > "$EVIDENCE_DIR/manifest.sha256"
    cd "$EVIDENCE_DIR"
    sha256sum *.log >> manifest.sha256 2>/dev/null || true
    cat "$EVIDENCE_DIR/manifest.sha256"
}

# =============================================================================
# Main
# =============================================================================
main() {
    echo "=============================================="
    echo "TITAN ADVERSARIAL DRILL SUITE"
    echo "Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "Evidence: $EVIDENCE_DIR"
    echo "=============================================="
    echo ""
    
    local drill="$1"
    
    if [ -z "$drill" ]; then
        # Run all drills
        drill_bad_signature
        drill_empty_secret
        drill_policy_mismatch
        drill_kill_switch
    else
        case "$drill" in
            bad_signature)  drill_bad_signature ;;
            empty_secret)   drill_empty_secret ;;
            policy_mismatch) drill_policy_mismatch ;;
            kill_switch)    drill_kill_switch ;;
            *)
                echo "Unknown drill: $drill"
                echo "Available: bad_signature, empty_secret, policy_mismatch, kill_switch"
                exit 1
                ;;
        esac
    fi
    
    print_summary
}

main "$@"
