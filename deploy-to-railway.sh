#!/bin/bash

# Titan Trading System - Railway Deployment Script
# This script helps deploy all Titan services to Railway

set -e  # Exit on any error

echo "🚀 Titan Trading System - Railway Deployment"
echo "============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Railway CLI is installed
check_railway_cli() {
    if ! command -v railway &> /dev/null; then
        print_error "Railway CLI not found. Please install it first:"
        echo "npm install -g @railway/cli"
        echo "or visit: https://docs.railway.app/develop/cli"
        exit 1
    fi
    print_success "Railway CLI found"
}

# Check if user is logged in to Railway
check_railway_auth() {
    if ! railway whoami &> /dev/null; then
        print_error "Not logged in to Railway. Please run:"
        echo "railway login"
        exit 1
    fi
    print_success "Railway authentication verified"
}

# Function to deploy a service
deploy_service() {
    local service_name=$1
    local service_path=$2
    
    print_status "Deploying $service_name..."
    
    if [ ! -d "$service_path" ]; then
        print_error "Service directory not found: $service_path"
        return 1
    fi
    
    cd "$service_path"
    
    # Check if railway.json exists
    if [ ! -f "railway.json" ]; then
        print_warning "No railway.json found for $service_name"
    fi
    
    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        print_error "No package.json found for $service_name"
        cd - > /dev/null
        return 1
    fi
    
    # Deploy to Railway
    print_status "Running railway up for $service_name..."
    if railway up; then
        print_success "$service_name deployed successfully"
    else
        print_error "Failed to deploy $service_name"
        cd - > /dev/null
        return 1
    fi
    
    cd - > /dev/null
}

# Function to test health endpoint
test_health_endpoint() {
    local service_name=$1
    local health_url=$2
    
    print_status "Testing health endpoint for $service_name..."
    
    # Wait a bit for service to start
    sleep 10
    
    if curl -f -s "$health_url" > /dev/null; then
        print_success "$service_name health check passed"
    else
        print_warning "$service_name health check failed (service may still be starting)"
    fi
}

# Main deployment function
main() {
    print_status "Starting Titan Trading System deployment to Railway"
    
    # Pre-flight checks
    check_railway_cli
    check_railway_auth
    
    # Check if we're in the right directory
    if [ ! -f "README.md" ] || [ ! -d "services" ]; then
        print_error "Please run this script from the Titan project root directory"
        exit 1
    fi
    
    print_status "Pre-flight checks passed"
    
    # Ask user which services to deploy
    echo ""
    echo "Which services would you like to deploy?"
    echo "1) All services (recommended for first deployment)"
    echo "2) Titan Brain only"
    echo "3) Titan Execution only"

    echo "5) Titan Scavenger only"
    echo "6) Custom selection"
    
    read -p "Enter your choice (1-6): " choice
    
    case $choice in
        1)
            # Deploy all services
            print_status "Deploying all Titan services..."
            
            deploy_service "Titan Brain" "services/titan-brain"
            deploy_service "Titan Execution" "services/titan-execution"

            deploy_service "Titan Scavenger" "services/titan-phase1-scavenger"
            ;;
        2)
            deploy_service "Titan Brain" "services/titan-brain"
            ;;
        3)
            deploy_service "Titan Execution" "services/titan-execution"
            ;;

        5)
            deploy_service "Titan Scavenger" "services/titan-phase1-scavenger"
            ;;
        6)
            echo "Custom selection not implemented yet. Please run individual deployments."
            exit 1
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac
    
    print_success "Deployment completed!"
    
    # Provide next steps
    echo ""
    echo "🎉 Deployment Summary"
    echo "===================="
    echo ""
    echo "Next steps:"
    echo "1. Set environment variables in Railway dashboard"
    echo "2. Update service URLs in your .env file"
    echo "3. Test health endpoints"
    echo "4. Run end-to-end tests"
    echo ""
    echo "For detailed instructions, see: PRODUCTION_SETUP_GUIDE.md"
    echo ""
    print_warning "Remember to:"
    print_warning "- Set up real API credentials (not demo keys)"
    print_warning "- Configure database and Redis connections"
    print_warning "- Set up Telegram notifications"
    print_warning "- Start with testnet and minimal risk"
}

# Handle script interruption
trap 'print_error "Deployment interrupted"; exit 1' INT

# Run main function
main "$@"