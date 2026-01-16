#!/bin/bash
# =============================================================================
# Titan Trading System - DigitalOcean Deployment Script
# =============================================================================
# This script deploys the Titan Trading System to DigitalOcean App Platform
# using the doctl CLI.
#
# Prerequisites:
#   - doctl CLI installed: https://docs.digitalocean.com/reference/doctl/how-to/install/
#   - Authentication configured: doctl auth init
#   - Git repository connected to DigitalOcean
#
# Usage:
#   ./deploy-to-digitalocean.sh [options]
#
# Options:
#   --validate    Only validate the app spec without deploying
#   --create      Create a new app (first-time deployment)
#   --update      Update an existing app (subsequent deployments)
#   --logs        View deployment logs
#   --help        Show this help message
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_SPEC_PATH=".do/app.yaml"
APP_NAME="titan-trading-system"

# Print banner
print_banner() {
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                 TITAN TRADING SYSTEM                          ║${NC}"
    echo -e "${BLUE}║              DigitalOcean Deployment Script                   ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    # Check doctl
    if ! command -v doctl &> /dev/null; then
        echo -e "${RED}Error: doctl CLI is not installed${NC}"
        echo "Install it from: https://docs.digitalocean.com/reference/doctl/how-to/install/"
        exit 1
    fi
    echo -e "  ${GREEN}✓${NC} doctl CLI installed"
    
    # Check authentication
    if ! doctl account get &> /dev/null; then
        echo -e "${RED}Error: doctl is not authenticated${NC}"
        echo "Run: doctl auth init"
        exit 1
    fi
    echo -e "  ${GREEN}✓${NC} doctl authenticated"
    
    # Check app spec exists
    if [ ! -f "$APP_SPEC_PATH" ]; then
        echo -e "${RED}Error: App spec not found at $APP_SPEC_PATH${NC}"
        exit 1
    fi
    echo -e "  ${GREEN}✓${NC} App spec found"
    
    echo ""
}

# Validate app spec
validate_spec() {
    echo -e "${YELLOW}Validating app specification...${NC}"
    
    if doctl apps spec validate "$APP_SPEC_PATH"; then
        echo -e "${GREEN}✓ App specification is valid${NC}"
        return 0
    else
        echo -e "${RED}✗ App specification validation failed${NC}"
        return 1
    fi
}

# Get app ID if exists
get_app_id() {
    doctl apps list --format ID,Spec.Name --no-header | grep "$APP_NAME" | awk '{print $1}' || echo ""
}

# Create new app
create_app() {
    echo -e "${YELLOW}Creating new DigitalOcean App...${NC}"
    
    APP_ID=$(get_app_id)
    if [ -n "$APP_ID" ]; then
        echo -e "${YELLOW}Warning: App '$APP_NAME' already exists (ID: $APP_ID)${NC}"
        echo "Use --update to update the existing app"
        exit 1
    fi
    
    echo "Creating app from $APP_SPEC_PATH..."
    doctl apps create --spec "$APP_SPEC_PATH" --wait
    
    echo -e "${GREEN}✓ App created successfully${NC}"
    echo ""
    
    # Get the new app ID and show status
    APP_ID=$(get_app_id)
    if [ -n "$APP_ID" ]; then
        echo -e "${BLUE}App ID: $APP_ID${NC}"
        doctl apps get "$APP_ID" --format ID,DefaultIngress,ActiveDeployment.Phase
    fi
}

# Update existing app
update_app() {
    echo -e "${YELLOW}Updating DigitalOcean App...${NC}"
    
    APP_ID=$(get_app_id)
    if [ -z "$APP_ID" ]; then
        echo -e "${RED}Error: App '$APP_NAME' not found${NC}"
        echo "Use --create for first-time deployment"
        exit 1
    fi
    
    echo "Updating app $APP_ID from $APP_SPEC_PATH..."
    doctl apps update "$APP_ID" --spec "$APP_SPEC_PATH" --wait
    
    echo -e "${GREEN}✓ App updated successfully${NC}"
    echo ""
    
    # Show deployment status
    doctl apps get "$APP_ID" --format ID,DefaultIngress,ActiveDeployment.Phase
}

# View deployment logs
view_logs() {
    APP_ID=$(get_app_id)
    if [ -z "$APP_ID" ]; then
        echo -e "${RED}Error: App '$APP_NAME' not found${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}Fetching deployment logs for app $APP_ID...${NC}"
    echo ""
    
    # Get the active deployment
    DEPLOYMENT_ID=$(doctl apps list-deployments "$APP_ID" --format ID --no-header | head -1)
    
    if [ -n "$DEPLOYMENT_ID" ]; then
        doctl apps logs "$APP_ID" --deployment "$DEPLOYMENT_ID" --type=deploy
    else
        echo "No deployments found"
    fi
}

# Show app status
show_status() {
    APP_ID=$(get_app_id)
    if [ -z "$APP_ID" ]; then
        echo -e "${YELLOW}App '$APP_NAME' not found${NC}"
        return
    fi
    
    echo -e "${BLUE}App Status:${NC}"
    doctl apps get "$APP_ID" --format ID,DefaultIngress,LiveURL,ActiveDeployment.Phase,Region
    
    echo ""
    echo -e "${BLUE}Services:${NC}"
    doctl apps list-deployments "$APP_ID" --format ID,Phase,Progress,CreatedAt | head -5
}

# Show help
show_help() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --validate    Only validate the app spec without deploying"
    echo "  --create      Create a new app (first-time deployment)"
    echo "  --update      Update an existing app (subsequent deployments)"
    echo "  --logs        View deployment logs"
    echo "  --status      Show app status"
    echo "  --help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --validate     # Validate app.yaml before deploying"
    echo "  $0 --create       # First-time deployment"
    echo "  $0 --update       # Update after code changes"
}

# Main
print_banner

case "${1:-}" in
    --validate)
        check_prerequisites
        validate_spec
        ;;
    --create)
        check_prerequisites
        validate_spec
        create_app
        ;;
    --update)
        check_prerequisites
        validate_spec
        update_app
        ;;
    --logs)
        view_logs
        ;;
    --status)
        show_status
        ;;
    --help|-h)
        show_help
        ;;
    *)
        echo -e "${YELLOW}No option specified. Running validation only.${NC}"
        echo ""
        check_prerequisites
        validate_spec
        echo ""
        echo "To deploy, use: $0 --create (first time) or $0 --update (subsequent)"
        ;;
esac

echo ""
echo -e "${GREEN}Done!${NC}"
