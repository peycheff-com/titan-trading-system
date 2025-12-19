#!/bin/bash

# Titan Execution Service - Dependency Installation Script
# Installs all required dependencies for production readiness features

set -e  # Exit on error

echo "🚀 Installing Titan Execution Service Dependencies"
echo "=================================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found"
    echo "   Please run this script from services/titan-execution directory"
    exit 1
fi

echo "📦 Installing production dependencies..."
echo ""

# Core dependencies (if not already installed)
npm install --save \
    fastify \
    @fastify/cors \
    dotenv \
    sqlite3 \
    ws \
    node-fetch \
    crypto

echo ""
echo "📦 Installing production readiness dependencies..."
echo ""

# Monitoring
npm install --save prom-client

# Security
npm install --save express-rate-limit

# Validation
npm install --save ajv ajv-formats validator

# AWS (for backups)
npm install --save @aws-sdk/client-s3

# Redis (optional)
npm install --save redis

echo ""
echo "📦 Installing development dependencies..."
echo ""

# Testing
npm install --save-dev \
    jest \
    @types/jest \
    fast-check

# Linting
npm install --save-dev \
    eslint \
    eslint-config-standard \
    eslint-plugin-import \
    eslint-plugin-node \
    eslint-plugin-promise

echo ""
echo "✅ All dependencies installed successfully!"
echo ""
echo "📋 Next steps:"
echo "   1. Configure environment variables: cp .env.example .env"
echo "   2. Configure application: cp config/production.example.json config/production.json"
echo "   3. Encrypt credentials: node security/CredentialManager.js encrypt"
echo "   4. Run tests: npm test"
echo "   5. Start service: pm2 start server.js --name titan-execution"
echo ""
echo "📚 Documentation:"
echo "   - Deployment: docs/deployment.md"
echo "   - Operations: docs/operations.md"
echo "   - Error Recovery: docs/runbooks/error-recovery.md"
echo ""
