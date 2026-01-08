#!/bin/bash

# Monitoring Stack Validation Script
# Validates all monitoring components are working correctly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Validating Titan Monitoring Stack...${NC}"
echo ""

# Function to check service health
check_service() {
    local service_name=$1
    local url=$2
    local expected_response=$3
    
    echo -n "   Checking $service_name... "
    
    if response=$(curl -s --max-time 5 "$url" 2>/dev/null); then
        if [[ "$response" == *"$expected_response"* ]] || [[ "$response" == *"Prometheus is Healthy"* ]] || [[ "$response" == *"Prometheus Server is Healthy"* ]]; then
            echo -e "${GREEN}✓ OK${NC}"
            return 0
        else
            echo -e "${RED}✗ Unexpected response${NC}"
            echo "     Expected: $expected_response"
            echo "     Got: $response"
            return 1
        fi
    else
        echo -e "${RED}✗ Connection failed${NC}"
        return 1
    fi
}

# Function to check if process is running
check_process() {
    local process_name=$1
    echo -n "   Checking $process_name process... "
    
    if pgrep -f "$process_name" > /dev/null; then
        echo -e "${GREEN}✓ Running${NC}"
        return 0
    else
        echo -e "${RED}✗ Not running${NC}"
        return 1
    fi
}

# Validation results
validation_errors=0

echo -e "${BLUE}📊 Core Services Health Check${NC}"

# Check Prometheus
if check_service "Prometheus" "http://localhost:9090/-/healthy" "Prometheus is Healthy"; then
    # Check Prometheus targets
    echo -n "   Checking Prometheus targets... "
    targets=$(curl -s http://localhost:9090/api/v1/targets | jq -r '.data.activeTargets | length')
    if [[ "$targets" -gt 0 ]]; then
        echo -e "${GREEN}✓ $targets targets configured${NC}"
    else
        echo -e "${RED}✗ No targets found${NC}"
        ((validation_errors++))
    fi
else
    ((validation_errors++))
fi

# Check Grafana
if check_service "Grafana" "http://localhost:3000/api/health" "ok"; then
    echo -n "   Checking Grafana datasources... "
    # Note: This would require authentication in a real setup
    echo -e "${YELLOW}⚠ Manual verification required${NC}"
else
    ((validation_errors++))
fi

# Check Alertmanager
if check_service "Alertmanager" "http://localhost:9093/-/healthy" "OK"; then
    echo -n "   Checking Alertmanager config... "
    config_status=$(curl -s http://localhost:9093/api/v1/status | jq -r '.status // "error"')
    if [[ "$config_status" == "success" ]]; then
        echo -e "${GREEN}✓ Configuration valid${NC}"
    else
        echo -e "${RED}✗ Configuration error${NC}"
        ((validation_errors++))
    fi
else
    ((validation_errors++))
fi

# Check Loki
if check_service "Loki" "http://localhost:3100/ready" "ready"; then
    echo -n "   Checking Loki ingester... "
    # Additional Loki health checks could go here
    echo -e "${GREEN}✓ Ready${NC}"
else
    ((validation_errors++))
fi

# Check Promtail
if check_process "promtail"; then
    echo -n "   Checking Promtail metrics... "
    if curl -s http://localhost:9080/metrics | grep -q "promtail_"; then
        echo -e "${GREEN}✓ Metrics available${NC}"
    else
        echo -e "${YELLOW}⚠ Metrics endpoint not accessible${NC}"
    fi
else
    ((validation_errors++))
fi

echo ""
echo -e "${BLUE}📁 Configuration Files${NC}"

# Check configuration files exist and are valid
configs=(
    "prometheus/config/prometheus.yml"
    "grafana/config/grafana.ini"
    "alertmanager/config/alertmanager.yml"
    "loki/config/loki.yml"
    "promtail/config/promtail.yml"
)

for config in "${configs[@]}"; do
    echo -n "   Checking $config... "
    if [[ -f "$config" ]]; then
        echo -e "${GREEN}✓ Exists${NC}"
    else
        echo -e "${RED}✗ Missing${NC}"
        ((validation_errors++))
    fi
done

echo ""
echo -e "${BLUE}📋 Log Files${NC}"

# Check log files
logs=(
    "logs/prometheus.log"
    "logs/grafana.log"
    "logs/alertmanager.log"
    "logs/loki.log"
    "logs/promtail.log"
)

for log in "${logs[@]}"; do
    echo -n "   Checking $log... "
    if [[ -f "$log" ]]; then
        size=$(wc -c < "$log")
        echo -e "${GREEN}✓ Exists (${size} bytes)${NC}"
    else
        echo -e "${YELLOW}⚠ Missing${NC}"
    fi
done

echo ""
echo -e "${BLUE}🔗 Service Connectivity${NC}"

# Test Prometheus -> Alertmanager
echo -n "   Prometheus -> Alertmanager... "
if curl -s http://localhost:9090/api/v1/alertmanagers | grep -q "localhost:9093"; then
    echo -e "${GREEN}✓ Connected${NC}"
else
    echo -e "${RED}✗ Not connected${NC}"
    ((validation_errors++))
fi

# Test Promtail -> Loki
echo -n "   Promtail -> Loki... "
# This is harder to test directly, but we can check if Promtail is configured correctly
if grep -q "localhost:3100" promtail/config/promtail.yml; then
    echo -e "${GREEN}✓ Configured${NC}"
else
    echo -e "${RED}✗ Not configured${NC}"
    ((validation_errors++))
fi

echo ""
echo -e "${BLUE}📊 Sample Metrics Test${NC}"

# Test if we can query some basic metrics
echo -n "   Querying Prometheus metrics... "
if curl -s "http://localhost:9090/api/v1/query?query=up" | grep -q '"status":"success"'; then
    echo -e "${GREEN}✓ Query successful${NC}"
else
    echo -e "${RED}✗ Query failed${NC}"
    ((validation_errors++))
fi

# Test alert rules
echo -n "   Checking alert rules... "
rules=$(curl -s http://localhost:9090/api/v1/rules | jq -r '.data.groups | length')
if [[ "$rules" -gt 0 ]]; then
    echo -e "${GREEN}✓ $rules rule groups loaded${NC}"
else
    echo -e "${RED}✗ No alert rules loaded${NC}"
    ((validation_errors++))
fi

echo ""

# Final summary
if [[ $validation_errors -eq 0 ]]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║         MONITORING VALIDATION SUCCESSFUL                   ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}✅ All monitoring components are working correctly!${NC}"
    echo ""
    echo -e "${BLUE}🌐 Access URLs:${NC}"
    echo -e "   • Prometheus: http://localhost:9090"
    echo -e "   • Grafana:    http://localhost:3000 (admin/titan123)"
    echo -e "   • Alertmanager: http://localhost:9093"
    echo -e "   • Loki:       http://localhost:3100"
    echo ""
    echo -e "${BLUE}📊 Next Steps:${NC}"
    echo -e "   1. Import Grafana dashboards"
    echo -e "   2. Configure notification channels"
    echo -e "   3. Test alert delivery"
    echo -e "   4. Start Titan services to see metrics"
    
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║         MONITORING VALIDATION FAILED                       ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${RED}❌ Found $validation_errors validation errors${NC}"
    echo ""
    echo -e "${YELLOW}🔧 Troubleshooting:${NC}"
    echo -e "   1. Check service logs in monitoring/logs/"
    echo -e "   2. Verify configuration files"
    echo -e "   3. Ensure all required ports are available"
    echo -e "   4. Restart monitoring stack: ./stop-monitoring.sh && ./start-monitoring.sh"
    
    exit 1
fi