#!/bin/bash

# Titan Execution Service - Monitoring Setup Script
# Requirements: 6.1-6.7 - Set up Prometheus + Grafana monitoring
#
# This script automates the installation and configuration of Prometheus and Grafana
# for monitoring the Titan Execution Service.
#
# Usage:
#   ./scripts/setup-monitoring.sh

set -e

echo "🚀 Titan Execution Service - Monitoring Setup"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detect OS
OS="$(uname -s)"
case "${OS}" in
    Linux*)     MACHINE=Linux;;
    Darwin*)    MACHINE=Mac;;
    *)          MACHINE="UNKNOWN:${OS}"
esac

echo "Detected OS: ${MACHINE}"
echo ""

# Check if running on macOS
if [ "$MACHINE" = "Mac" ]; then
    echo "📦 Installing Prometheus and Grafana via Homebrew..."
    
    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        echo -e "${RED}❌ Homebrew not found. Please install Homebrew first:${NC}"
        echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi
    
    # Install Prometheus
    if ! command -v prometheus &> /dev/null; then
        echo "Installing Prometheus..."
        brew install prometheus
        echo -e "${GREEN}✅ Prometheus installed${NC}"
    else
        echo -e "${GREEN}✅ Prometheus already installed${NC}"
    fi
    
    # Install Grafana
    if ! command -v grafana-server &> /dev/null; then
        echo "Installing Grafana..."
        brew install grafana
        echo -e "${GREEN}✅ Grafana installed${NC}"
    else
        echo -e "${GREEN}✅ Grafana already installed${NC}"
    fi
    
elif [ "$MACHINE" = "Linux" ]; then
    echo "📦 Installing Prometheus and Grafana on Linux..."
    
    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        echo -e "${RED}❌ Please run as root (sudo)${NC}"
        exit 1
    fi
    
    # Install Prometheus
    if ! command -v prometheus &> /dev/null; then
        echo "Installing Prometheus..."
        apt-get update
        apt-get install -y prometheus
        echo -e "${GREEN}✅ Prometheus installed${NC}"
    else
        echo -e "${GREEN}✅ Prometheus already installed${NC}"
    fi
    
    # Install Grafana
    if ! command -v grafana-server &> /dev/null; then
        echo "Installing Grafana..."
        apt-get install -y software-properties-common
        add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
        wget -q -O - https://packages.grafana.com/gpg.key | apt-key add -
        apt-get update
        apt-get install -y grafana
        echo -e "${GREEN}✅ Grafana installed${NC}"
    else
        echo -e "${GREEN}✅ Grafana already installed${NC}"
    fi
else
    echo -e "${RED}❌ Unsupported OS: ${MACHINE}${NC}"
    echo "Please install Prometheus and Grafana manually:"
    echo "  - Prometheus: https://prometheus.io/download/"
    echo "  - Grafana: https://grafana.com/grafana/download"
    exit 1
fi

echo ""
echo "📝 Configuring Prometheus..."

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MONITORING_DIR="$PROJECT_ROOT/monitoring"

# Check if prometheus.yml exists
if [ ! -f "$MONITORING_DIR/prometheus.yml" ]; then
    echo -e "${RED}❌ prometheus.yml not found at $MONITORING_DIR/prometheus.yml${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prometheus configuration found${NC}"

echo ""
echo "🚀 Starting services..."

if [ "$MACHINE" = "Mac" ]; then
    # Start Prometheus
    echo "Starting Prometheus..."
    nohup prometheus --config.file="$MONITORING_DIR/prometheus.yml" > "$PROJECT_ROOT/../../../logs/prometheus.log" 2>&1 &
    PROMETHEUS_PID=$!
    echo -e "${GREEN}✅ Prometheus started (PID: $PROMETHEUS_PID)${NC}"
    echo "   Logs: logs/prometheus.log"
    echo "   URL: http://localhost:9090"
    
    # Start Grafana
    echo "Starting Grafana..."
    brew services start grafana
    echo -e "${GREEN}✅ Grafana started${NC}"
    echo "   URL: http://localhost:3000"
    echo "   Default credentials: admin/admin"
    
elif [ "$MACHINE" = "Linux" ]; then
    # Start Prometheus
    echo "Starting Prometheus..."
    systemctl start prometheus
    systemctl enable prometheus
    echo -e "${GREEN}✅ Prometheus started${NC}"
    echo "   URL: http://localhost:9090"
    
    # Start Grafana
    echo "Starting Grafana..."
    systemctl start grafana-server
    systemctl enable grafana-server
    echo -e "${GREEN}✅ Grafana started${NC}"
    echo "   URL: http://localhost:3000"
    echo "   Default credentials: admin/admin"
fi

echo ""
echo "⏳ Waiting for services to start..."
sleep 5

# Check if Prometheus is running
if curl -s http://localhost:9090/-/healthy > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Prometheus is healthy${NC}"
else
    echo -e "${YELLOW}⚠️  Prometheus health check failed - it may still be starting${NC}"
fi

# Check if Grafana is running
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Grafana is healthy${NC}"
else
    echo -e "${YELLOW}⚠️  Grafana health check failed - it may still be starting${NC}"
fi

echo ""
echo "📊 Next Steps:"
echo "=============="
echo ""
echo "1. Verify Prometheus is scraping metrics:"
echo "   curl http://localhost:9090/api/v1/query?query=titan_equity_usd"
echo ""
echo "2. Log in to Grafana:"
echo "   Open http://localhost:3000"
echo "   Username: admin"
echo "   Password: admin"
echo ""
echo "3. Add Prometheus data source in Grafana:"
echo "   - Go to Configuration → Data Sources"
echo "   - Add Prometheus"
echo "   - URL: http://localhost:9090"
echo "   - Click 'Save & Test'"
echo ""
echo "4. Import Titan dashboard:"
echo "   - Go to Dashboards → Import"
echo "   - Upload: $MONITORING_DIR/grafana-dashboard.json"
echo ""
echo "5. Configure alerting (optional):"
echo "   - See docs/MONITORING_SETUP.md for Slack/Email setup"
echo ""
echo -e "${GREEN}✅ Monitoring setup complete!${NC}"
echo ""
echo "For detailed instructions, see:"
echo "  $PROJECT_ROOT/docs/MONITORING_SETUP.md"
