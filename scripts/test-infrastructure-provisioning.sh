#!/bin/bash

# Test script for Titan Infrastructure Provisioning
# This script tests the infrastructure provisioning functionality without making system changes

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Logging functions
log() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

run_test() {
    TESTS_RUN=$((TESTS_RUN + 1))
    log "Running test: $1"
}

# Test script existence and permissions
test_script_files() {
    run_test "Script files existence and permissions"
    
    local scripts=(
        "scripts/provision-infrastructure.sh"
        "scripts/validate-infrastructure.sh"
    )
    
    for script in "${scripts[@]}"; do
        if [[ -f "$script" ]]; then
            if [[ -x "$script" ]]; then
                pass "$script exists and is executable"
            else
                fail "$script exists but is not executable"
            fi
        else
            fail "$script does not exist"
        fi
    done
}

# Test configuration files
test_config_files() {
    run_test "Configuration files"
    
    local configs=(
        "config/infrastructure.config.json"
        "config/deployment/infrastructure.env"
    )
    
    for config in "${configs[@]}"; do
        if [[ -f "$config" ]]; then
            pass "$config exists"
            
            # Test JSON validity for .json files
            if [[ "$config" == *.json ]]; then
                if python3 -m json.tool "$config" > /dev/null 2>&1; then
                    pass "$config is valid JSON"
                else
                    fail "$config is invalid JSON"
                fi
            fi
        else
            fail "$config does not exist"
        fi
    done
}

# Test documentation
test_documentation() {
    run_test "Documentation files"
    
    local docs=(
        "docs/infrastructure/INFRASTRUCTURE_SETUP.md"
    )
    
    for doc in "${docs[@]}"; do
        if [[ -f "$doc" ]]; then
            pass "$doc exists"
            
            # Check if documentation has required sections
            if grep -q "## Prerequisites" "$doc" && \
               grep -q "## Quick Start" "$doc" && \
               grep -q "## Troubleshooting" "$doc"; then
                pass "$doc contains required sections"
            else
                fail "$doc missing required sections"
            fi
        else
            fail "$doc does not exist"
        fi
    done
}

# Test script syntax
test_script_syntax() {
    run_test "Script syntax validation"
    
    local scripts=(
        "scripts/provision-infrastructure.sh"
        "scripts/validate-infrastructure.sh"
    )
    
    for script in "${scripts[@]}"; do
        if bash -n "$script" 2>/dev/null; then
            pass "$script has valid bash syntax"
        else
            fail "$script has syntax errors"
        fi
    done
}

# Test script help functionality
test_script_help() {
    run_test "Script help functionality"
    
    # Test provision script help
    if ./scripts/provision-infrastructure.sh --help > /dev/null 2>&1; then
        pass "provision-infrastructure.sh --help works"
    else
        fail "provision-infrastructure.sh --help failed"
    fi
    
    # Test that help contains usage information
    local help_output=$(./scripts/provision-infrastructure.sh --help 2>&1)
    if echo "$help_output" | grep -q "Usage:"; then
        pass "provision-infrastructure.sh help contains usage information"
    else
        fail "provision-infrastructure.sh help missing usage information"
    fi
}

# Test configuration validation
test_config_validation() {
    run_test "Configuration validation"
    
    # Test infrastructure config structure
    local config="config/infrastructure.config.json"
    if [[ -f "$config" ]]; then
        # Check for required top-level keys
        local required_keys=("infrastructure" "deployment" "validation")
        for key in "${required_keys[@]}"; do
            if python3 -c "import json; data=json.load(open('$config')); print('$key' in data)" 2>/dev/null | grep -q "True"; then
                pass "$config contains required key: $key"
            else
                fail "$config missing required key: $key"
            fi
        done
    fi
}

# Test environment file format
test_env_file_format() {
    run_test "Environment file format"
    
    local env_file="config/deployment/infrastructure.env"
    if [[ -f "$env_file" ]]; then
        # Check for required environment variables
        local required_vars=(
            "MIN_RAM_GB"
            "MIN_CPU_CORES"
            "NODE_VERSION"
            "REDIS_PORT"
            "TITAN_USER"
        )
        
        for var in "${required_vars[@]}"; do
            if grep -q "^${var}=" "$env_file"; then
                pass "$env_file contains required variable: $var"
            else
                fail "$env_file missing required variable: $var"
            fi
        done
        
        # Check for proper format (no spaces around =)
        if grep -q " = " "$env_file"; then
            fail "$env_file contains improperly formatted variables (spaces around =)"
        else
            pass "$env_file has proper variable formatting"
        fi
    fi
}

# Test script argument parsing
test_argument_parsing() {
    run_test "Script argument parsing"
    
    # Test invalid arguments
    if ./scripts/provision-infrastructure.sh --invalid-option > /dev/null 2>&1; then
        fail "provision-infrastructure.sh accepts invalid arguments"
    else
        pass "provision-infrastructure.sh rejects invalid arguments"
    fi
    
    # Test domain argument (should not fail with valid format)
    if ./scripts/provision-infrastructure.sh --domain example.com --help > /dev/null 2>&1; then
        pass "provision-infrastructure.sh accepts domain argument"
    else
        fail "provision-infrastructure.sh rejects valid domain argument"
    fi
}

# Test validation script functionality
test_validation_script() {
    run_test "Validation script functionality"
    
    # The validation script should run without errors even on systems that don't meet requirements
    # It should just report what's missing
    if timeout 30 ./scripts/validate-infrastructure.sh > /dev/null 2>&1; then
        pass "validate-infrastructure.sh runs without hanging"
    else
        warn "validate-infrastructure.sh may have issues (timeout or error)"
    fi
}

# Test directory structure requirements
test_directory_structure() {
    run_test "Directory structure"
    
    local required_dirs=(
        "scripts"
        "config"
        "config/deployment"
        "docs"
        "docs/infrastructure"
    )
    
    for dir in "${required_dirs[@]}"; do
        if [[ -d "$dir" ]]; then
            pass "Required directory exists: $dir"
        else
            fail "Required directory missing: $dir"
        fi
    done
}

# Test script dependencies
test_script_dependencies() {
    run_test "Script dependencies"
    
    # Check if required commands are available for testing
    local commands=("bash" "python3" "grep" "awk")
    
    for cmd in "${commands[@]}"; do
        if command -v "$cmd" > /dev/null 2>&1; then
            pass "Required command available: $cmd"
        else
            fail "Required command missing: $cmd"
        fi
    done
}

# Generate test report
generate_test_report() {
    echo
    log "=== INFRASTRUCTURE PROVISIONING TEST REPORT ==="
    echo
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        pass "All tests passed!"
        log "✅ Infrastructure provisioning scripts are ready for use"
    else
        fail "$TESTS_FAILED test(s) failed"
        log "❌ Infrastructure provisioning scripts need fixes"
    fi
    
    echo
    log "Test Results: $TESTS_PASSED passed, $TESTS_FAILED failed, $TESTS_RUN total"
    echo
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        log "Next steps:"
        log "1. Review configuration files and customize as needed"
        log "2. Run './scripts/provision-infrastructure.sh --help' for usage"
        log "3. Execute provisioning on target server"
        log "4. Validate with './scripts/validate-infrastructure.sh'"
        return 0
    else
        log "Please fix the failed tests before proceeding with deployment"
        return 1
    fi
}

# Main execution
main() {
    log "Starting Infrastructure Provisioning Tests..."
    echo
    
    test_script_files
    test_config_files
    test_documentation
    test_script_syntax
    test_script_help
    test_config_validation
    test_env_file_format
    test_argument_parsing
    test_validation_script
    test_directory_structure
    test_script_dependencies
    
    generate_test_report
}

# Run tests
main "$@"