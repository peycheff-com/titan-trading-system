#!/bin/bash

# Titan Execution - Quick Start Script
# This script automates the initial setup and deployment

set -e  # Exit on error

echo "🚀 Titan Execution - Quick Start"
echo "================================"
echo ""

# Check Node.js version
echo "📋 Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Error: Node.js 18+ required. Current version: $(node -v)"
    echo "   Install from: https://nodejs.org/"
    exit 1
fi
echo "✅ Node.js $(node -v) detected"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    echo "   Please configure .env file first"
    exit 1
fi
echo "✅ .env file found"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
if [ ! -d node_modules ]; then
    npm install
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi
echo ""

# Initialize database
echo "💾 Initializing database..."
if [ ! -f titan_execution.db ]; then
    npm run migrate
    echo "✅ Database initialized"
else
    echo "⚠️  Database already exists. Running migrations..."
    npm run migrate
    echo "✅ Migrations complete"
fi
echo ""

# Check configuration
echo "🔍 Checking configuration..."
HMAC_SECRET=$(grep HMAC_SECRET .env | cut -d'=' -f2)
if [ ${#HMAC_SECRET} -lt 32 ]; then
    echo "⚠️  Warning: HMAC_SECRET is less than 32 characters"
    echo "   Generate a secure secret with:"
    echo "   node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
fi

BROKER_API_KEY=$(grep "^BROKER_API_KEY=" .env | cut -d'=' -f2)
if [ -z "$BROKER_API_KEY" ]; then
    echo "⚠️  Warning: BROKER_API_KEY not set"
    echo "   You can configure this via the web UI at http://localhost:3000"
fi
echo ""

# Display configuration summary
echo "📊 Configuration Summary"
echo "========================"
echo "Port: $(grep PORT .env | cut -d'=' -f2)"
echo "Environment: $(grep NODE_ENV .env | cut -d'=' -f2)"
echo "Database: $(grep DATABASE_URL .env | cut -d'=' -f2)"
echo "Max Risk: $(grep MAX_RISK_PCT .env | cut -d'=' -f2)%"
echo "Phase 1 Risk: $(grep PHASE_1_RISK_PCT .env | cut -d'=' -f2)%"
echo "Phase 2 Risk: $(grep PHASE_2_RISK_PCT .env | cut -d'=' -f2)%"
echo ""

# Ask if user wants to start the server
echo "🎯 Ready to start!"
echo ""
echo "Options:"
echo "  1. Start production server (web UI)"
echo "  2. Start full server (terminal dashboard + web UI)"
echo "  3. Exit and start manually"
echo ""
read -p "Choose option (1-3): " choice

case $choice in
    1)
        echo ""
        echo "🚀 Starting production server..."
        echo ""
        echo "📱 Web UI will be available at: http://localhost:3000"
        echo ""
        echo "Press Ctrl+C to stop the server"
        echo ""
        sleep 2
        npm start
        ;;
    2)
        echo ""
        echo "🚀 Starting full server..."
        echo ""
        echo "📱 Web UI: http://localhost:3000"
        echo "💻 Terminal Dashboard: Active"
        echo ""
        echo "Press Ctrl+C to stop the server"
        echo ""
        sleep 2
        npm run start:full
        ;;
    3)
        echo ""
        echo "✅ Setup complete!"
        echo ""
        echo "To start the server manually:"
        echo "  npm start              # Production server (web UI)"
        echo "  npm run start:full     # Full server (terminal + web UI)"
        echo ""
        echo "📚 Read DEPLOYMENT-GUIDE.md for detailed instructions"
        ;;
    *)
        echo "Invalid option. Exiting."
        exit 1
        ;;
esac
