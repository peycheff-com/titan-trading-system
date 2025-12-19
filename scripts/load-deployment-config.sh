#!/bin/bash

# Deployment Configuration Loader
# Requirements: 7.1 - Environment-specific deployment configurations

set -e

# Default environment
ENVIRONMENT="${NODE_ENV:-development}"
CONFIG_DIR="$(dirname "$0")/../config/deployment"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 Loading deployment configuration for: $ENVIRONMENT${NC}"

# Check if environment config exists
CONFIG_FILE="$CONFIG_DIR/$ENVIRONMENT.env"
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}❌ Configuration file not found: $CONFIG_FILE${NC}"
    echo -e "${YELLOW}Available environments:${NC}"
    ls -1 "$CONFIG_DIR"/*.env 2>/dev/null | sed 's/.*\//   • /' | sed 's/\.env$//' || echo "   No configurations found"
    exit 1
fi

# Load configuration
echo -e "${BLUE}📋 Loading configuration from: $CONFIG_FILE${NC}"
set -a  # Automatically export all variables
source "$CONFIG_FILE"
set +a

# Validate required variables
REQUIRED_VARS=(
    "NODE_ENV"
    "CONSOLE_PORT"
    "EXECUTION_PORT" 
    "BRAIN_PORT"
    "DB_HOST"
    "DB_NAME"
    "DEPLOYMENT_MODE"
)

echo -e "${BLUE}🔍 Validating configuration...${NC}"
missing_vars=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    else
        echo -e "${GREEN}   ✓ $var=${!var}${NC}"
    fi
done

if [ ${#missing_vars[@]} -gt 0 ]; then
    echo -e "${RED}❌ Missing required variables:${NC}"
    for var in "${missing_vars[@]}"; do
        echo -e "${RED}   • $var${NC}"
    done
    exit 1
fi

# Environment-specific validations
case "$ENVIRONMENT" in
    "production")
        if [ "$HMAC_VALIDATION" != "true" ]; then
            echo -e "${RED}❌ HMAC validation must be enabled in production${NC}"
            exit 1
        fi
        if [ "$SSL_ENABLED" != "true" ]; then
            echo -e "${YELLOW}⚠ SSL should be enabled in production${NC}"
        fi
        ;;
    "development")
        if [ "$DEBUG_MODE" != "true" ]; then
            echo -e "${YELLOW}⚠ Debug mode recommended for development${NC}"
        fi
        ;;
    "staging")
        if [ "$MOCK_EXCHANGES" != "true" ]; then
            echo -e "${YELLOW}⚠ Mock exchanges recommended for staging${NC}"
        fi
        ;;
esac

# Create environment-specific directories
DIRS_TO_CREATE=(
    "logs/$ENVIRONMENT"
    "backups/$ENVIRONMENT"
    "tmp/$ENVIRONMENT"
)

for dir in "${DIRS_TO_CREATE[@]}"; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        echo -e "${GREEN}   ✓ Created directory: $dir${NC}"
    fi
done

# Export deployment metadata
export DEPLOYMENT_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
export DEPLOYMENT_ID="deploy-$(date +%s)"
export CONFIG_LOADED="true"

echo -e "${GREEN}✅ Configuration loaded successfully${NC}"
echo -e "${BLUE}   Environment: $ENVIRONMENT${NC}"
echo -e "${BLUE}   Deployment Mode: $DEPLOYMENT_MODE${NC}"
echo -e "${BLUE}   Deployment ID: $DEPLOYMENT_ID${NC}"

# Save current configuration for rollback
CONFIG_BACKUP_DIR=".deployment-configs"
mkdir -p "$CONFIG_BACKUP_DIR"
cp "$CONFIG_FILE" "$CONFIG_BACKUP_DIR/current-$DEPLOYMENT_ID.env"
echo -e "${BLUE}   Config backed up to: $CONFIG_BACKUP_DIR/current-$DEPLOYMENT_ID.env${NC}"