#!/bin/bash
# =============================================================================
# 04_verify.sh - Production verification script
# =============================================================================
# Runs comprehensive checks on the deployed production environment.
# Usage: ./04_verify.sh
# =============================================================================

set -euo pipefail

# Configuration
DOMAIN="${DOMAIN:-titan.peycheff.com}"
EXPECTED_SERVICES=("titan-traefik" "titan-nats" "titan-redis" "titan-postgres" "titan-brain" "titan-execution")

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

check_pass() { echo -e "${GREEN}✓${NC} $1"; ((PASS++)); }
check_fail() { echo -e "${RED}✗${NC} $1"; ((FAIL++)); }
check_warn() { echo -e "${YELLOW}⚠${NC} $1"; ((WARN++)); }

echo "============================================================"
echo "Titan Production Verification"
echo "============================================================"
echo ""

# =============================================================================
# 1. DNS Resolution
# =============================================================================
echo "1. DNS Resolution"
if command -v dig &>/dev/null; then
    IP=$(dig +short "${DOMAIN}" 2>/dev/null | head -1)
    if [ -n "$IP" ]; then
        check_pass "DNS resolves ${DOMAIN} -> ${IP}"
    else
        check_fail "DNS does not resolve for ${DOMAIN}"
    fi
else
    check_warn "dig not available, skipping DNS check"
fi

# =============================================================================
# 2. Container Status
# =============================================================================
echo ""
echo "2. Container Status"
for svc in "${EXPECTED_SERVICES[@]}"; do
    if docker ps --format '{{.Names}}' | grep -q "^${svc}$"; then
        STATUS=$(docker inspect --format='{{.State.Status}}' "$svc" 2>/dev/null)
        if [ "$STATUS" = "running" ]; then
            check_pass "${svc} is running"
        else
            check_fail "${svc} status: ${STATUS}"
        fi
    else
        check_fail "${svc} container not found"
    fi
done

# =============================================================================
# 3. Health Endpoints (Internal)
# =============================================================================
echo ""
echo "3. Health Endpoints"

# NATS
if curl -sf http://localhost:8222/healthz &>/dev/null; then
    check_pass "NATS health OK"
else
    check_warn "NATS health check failed (may be VPC-bound)"
fi

# Brain
if curl -sf http://localhost:3100/health &>/dev/null; then
    check_pass "Brain health OK"
else
    check_fail "Brain health check failed"
fi

# Execution
if curl -sf http://localhost:3002/health &>/dev/null; then
    check_pass "Execution health OK"
else
    check_fail "Execution health check failed"
fi

# =============================================================================
# 4. Database Connectivity
# =============================================================================
echo ""
echo "4. Database Connectivity"

# PostgreSQL
if docker exec titan-postgres pg_isready -U titan_user &>/dev/null; then
    check_pass "PostgreSQL accepting connections"
else
    check_fail "PostgreSQL not ready"
fi

# Redis
if docker exec titan-redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
    check_pass "Redis responding"
else
    check_fail "Redis not responding"
fi

# =============================================================================
# 5. TLS Certificate
# =============================================================================
echo ""
echo "5. TLS Certificate"
if command -v openssl &>/dev/null && [ -n "${IP:-}" ]; then
    CERT_DATES=$(echo | timeout 5 openssl s_client -connect "${DOMAIN}:443" -servername "${DOMAIN}" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null)
    if [ -n "$CERT_DATES" ]; then
        check_pass "TLS certificate valid"
        echo "    $CERT_DATES" | head -2 | sed 's/^/    /'
    else
        check_warn "Could not verify TLS certificate (may still be provisioning)"
    fi
else
    check_warn "Cannot verify TLS (openssl not available or DNS not resolved)"
fi

# =============================================================================
# 6. Console Accessibility
# =============================================================================
echo ""
echo "6. Console Accessibility"
if curl -sf "https://${DOMAIN}/" -o /dev/null --max-time 10 2>/dev/null; then
    check_pass "Console UI accessible at https://${DOMAIN}/"
else
    if curl -sf "http://localhost:8080/" -o /dev/null --max-time 5 2>/dev/null; then
        check_warn "Console accessible locally but not via domain (TLS/DNS issue?)"
    else
        check_fail "Console UI not accessible"
    fi
fi

# =============================================================================
# 7. Port Exposure Audit
# =============================================================================
echo ""
echo "7. Port Exposure (Host)"
echo "   Checking exposed ports on host..."

# Check what's listening
LISTENING=$(ss -tlnp 2>/dev/null | grep LISTEN | awk '{print $4}' | grep -oE ':[0-9]+$' | sort -u | tr '\n' ' ')
echo "   Listening: ${LISTENING:-none detected}"

# Check for unexpected exposures
UNEXPECTED=""
for port in 5432 6379 9090 3000 4222; do
    if echo "$LISTENING" | grep -q ":${port}"; then
        UNEXPECTED="${UNEXPECTED} ${port}"
    fi
done

if [ -n "$UNEXPECTED" ]; then
    check_warn "Potentially exposed internal ports:${UNEXPECTED}"
else
    check_pass "No internal service ports exposed to host"
fi

# =============================================================================
# 8. TITAN_MODE Check
# =============================================================================
echo ""
echo "8. Safety Mode"
if docker logs titan-brain 2>&1 | grep -q "TITAN_MODE.*DISARMED"; then
    check_pass "System is DISARMED"
elif docker logs titan-brain 2>&1 | grep -q "TITAN_MODE"; then
    MODE=$(docker logs titan-brain 2>&1 | grep "TITAN_MODE" | tail -1)
    check_warn "TITAN_MODE detected: ${MODE}"
else
    check_warn "Could not detect TITAN_MODE from logs"
fi

# =============================================================================
# 9. Secrets in Logs Check
# =============================================================================
echo ""
echo "9. Secrets Exposure Check"
SECRETS_FOUND=0
for container in titan-brain titan-execution; do
    if docker logs "$container" 2>&1 | grep -iE "(password|secret|api.?key)" | grep -v "TITAN_MODE" | head -1 &>/dev/null; then
        check_warn "Potential secrets in ${container} logs"
        SECRETS_FOUND=1
    fi
done
if [ $SECRETS_FOUND -eq 0 ]; then
    check_pass "No obvious secrets in logs"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================================================"
echo "Verification Summary"
echo "============================================================"
echo ""
echo -e "  ${GREEN}Passed${NC}: ${PASS}"
echo -e "  ${YELLOW}Warnings${NC}: ${WARN}"
echo -e "  ${RED}Failed${NC}: ${FAIL}"
echo ""

if [ $FAIL -gt 0 ]; then
    echo -e "${RED}VERIFICATION FAILED${NC} - Review errors above"
    exit 1
elif [ $WARN -gt 0 ]; then
    echo -e "${YELLOW}VERIFICATION PASSED WITH WARNINGS${NC}"
    exit 0
else
    echo -e "${GREEN}VERIFICATION PASSED${NC}"
    exit 0
fi
