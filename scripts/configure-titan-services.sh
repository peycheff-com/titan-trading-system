#!/bin/bash

# Titan Services Configuration Script
# This script configures all Titan services for production deployment
# Requirements: 2.1, 2.2

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$PROJECT_ROOT/config"
SERVICES_DIR="$PROJECT_ROOT/services"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Service configuration
declare -A SERVICE_CONFIGS=(
    ["shared"]="shared.config.json"
    ["security"]="security.config.json"
    ["titan-brain"]="brain.config.json"
    ["titan-execution"]="execution.config.json"
    ["titan-phase1-scavenger"]="phase1.config.json"
    ["titan-ai-quant"]="ai-quant.config.json"

)

# Environment variables for production
declare -A PRODUCTION_ENV=(
    ["NODE_ENV"]="production"
    ["LOG_LEVEL"]="info"
    ["REDIS_URL"]="redis://localhost:6379"
    ["METRICS_ENABLED"]="true"
    ["HEALTH_CHECK_ENABLED"]="true"
)

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Create configuration directories
create_config_directories() {
    log "Creating configuration directories..."
    
    local config_dirs=(
        "$CONFIG_DIR"
        "$CONFIG_DIR/deployment"
        "$CONFIG_DIR/services"
        "$CONFIG_DIR/security"
        "$CONFIG_DIR/monitoring"
    )
    
    for dir in "${config_dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            log "Created directory: $dir"
        fi
    done
    
    success "Configuration directories created"
}

# Generate service configuration
generate_service_config() {
    local service_name=$1
    local config_file=$2
    local service_path="$SERVICES_DIR/$service_name"
    
    log "Generating configuration for $service_name..."
    
    # Check if service exists
    if [[ ! -d "$service_path" ]]; then
        warning "Service directory not found: $service_path, skipping configuration"
        return 0
    fi
    
    local config_path="$CONFIG_DIR/$config_file"
    
    # Generate configuration based on service type
    case "$service_name" in
        "shared")
            generate_shared_config "$config_path"
            ;;
        "security")
            generate_security_config "$config_path"
            ;;
        "titan-brain")
            generate_brain_config "$config_path"
            ;;
        "titan-execution")
            generate_execution_config "$config_path"
            ;;
        "titan-phase1-scavenger")
            generate_phase1_config "$config_path"
            ;;
        "titan-ai-quant")
            generate_ai_quant_config "$config_path"
            ;;

        *)
            warning "Unknown service: $service_name"
            return 1
            ;;
    esac
    
    success "Configuration generated for $service_name: $config_path"
}

# Generate shared infrastructure configuration
generate_shared_config() {
    local config_path=$1
    
    cat > "$config_path" << 'EOF'
{
  "service": {
    "name": "titan-shared",
    "version": "1.0.0",
    "port": 3001,
    "host": "0.0.0.0"
  },
  "redis": {
    "host": "localhost",
    "port": 6379,
    "db": 0,
    "keyPrefix": "titan:",
    "retryDelayOnFailover": 100,
    "maxRetriesPerRequest": 3
  },
  "websocket": {
    "binance": {
      "url": "wss://stream.binance.com:9443/ws",
      "reconnectInterval": 5000,
      "maxReconnectAttempts": 10
    },
    "bybit": {
      "url": "wss://stream.bybit.com/v5/public/spot",
      "reconnectInterval": 5000,
      "maxReconnectAttempts": 10
    }
  },
  "execution": {
    "rateLimiting": {
      "requestsPerSecond": 10,
      "burstSize": 20
    },
    "retryPolicy": {
      "maxRetries": 3,
      "backoffMultiplier": 2,
      "initialDelay": 1000
    }
  },
  "telemetry": {
    "logLevel": "info",
    "logRotation": {
      "maxSize": "10MB",
      "maxFiles": 30,
      "compress": true
    },
    "metricsInterval": 5000
  },
  "health": {
    "endpoint": "/health",
    "timeout": 5000,
    "checks": ["redis", "websocket"]
  }
}
EOF
}

# Generate security service configuration
generate_security_config() {
    local config_path=$1
    
    cat > "$config_path" << 'EOF'
{
  "service": {
    "name": "titan-security",
    "version": "1.0.0",
    "port": 3002,
    "host": "0.0.0.0"
  },
  "tls": {
    "version": "1.3",
    "certificatePath": "/etc/ssl/certs/titan.crt",
    "privateKeyPath": "/etc/ssl/private/titan.key",
    "autoRenewal": true,
    "renewalDays": 30
  },
  "apiKeys": {
    "encryptionAlgorithm": "aes-256-gcm",
    "rotationInterval": 2592000,
    "keyDerivationRounds": 100000
  },
  "accessControl": {
    "allowedIPs": ["127.0.0.1"],
    "rateLimiting": {
      "windowMs": 900000,
      "maxRequests": 100
    },
    "fail2ban": {
      "enabled": true,
      "maxAttempts": 3,
      "banDuration": 3600
    }
  },
  "audit": {
    "logPath": "/var/log/titan/security.log",
    "events": ["authentication", "authorization", "keyRotation", "accessDenied"],
    "retention": 90
  },
  "health": {
    "endpoint": "/health",
    "timeout": 5000,
    "checks": ["certificates", "keyStore"]
  }
}
EOF
}

# Generate brain service configuration
generate_brain_config() {
    local config_path=$1
    
    cat > "$config_path" << 'EOF'
{
  "service": {
    "name": "titan-brain",
    "version": "1.0.0",
    "port": 3000,
    "host": "0.0.0.0"
  },
  "orchestration": {
    "maxTotalLeverage": 50,
    "maxGlobalDrawdown": 0.15,
    "emergencyFlattenThreshold": 0.15,
    "phaseTransitionRules": {
      "phase1ToPhase2": 5000,
      "phase2ToPhase3": 50000
    }
  },
  "capitalAllocation": {
    "phase1": {
      "minCapital": 200,
      "maxCapital": 5000,
      "allocationPercentage": 0.8
    },
    "phase2": {
      "minCapital": 2500,
      "maxCapital": 50000,
      "allocationPercentage": 0.6
    },
    "phase3": {
      "minCapital": 50000,
      "maxCapital": null,
      "allocationPercentage": 0.4
    }
  },
  "riskManagement": {
    "globalDrawdownLimits": [0.05, 0.10, 0.15],
    "correlationLimit": 0.8,
    "positionSizeLimits": {
      "phase1": 0.5,
      "phase2": 0.25,
      "phase3": 1.0
    }
  },
  "monitoring": {
    "metricsInterval": 1000,
    "alertThresholds": {
      "drawdown": 0.10,
      "leverage": 40,
      "correlation": 0.7
    }
  },
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "titan_brain",
    "user": "titan",
    "ssl": false,
    "poolSize": 10
  },
  "health": {
    "endpoint": "/status",
    "timeout": 5000,
    "checks": ["database", "redis", "phases"]
  }
}
EOF
}

# Generate execution service configuration
generate_execution_config() {
    local config_path=$1
    
    cat > "$config_path" << 'EOF'
{
  "service": {
    "name": "titan-execution",
    "version": "1.0.0",
    "port": 3003,
    "host": "0.0.0.0"
  },
  "exchanges": {
    "bybit": {
      "enabled": true,
      "testnet": false,
      "rateLimiting": {
        "requestsPerSecond": 10,
        "burstSize": 20
      },
      "orderTypes": ["MARKET", "LIMIT", "POST_ONLY"],
      "maxLeverage": 20
    },
    "mexc": {
      "enabled": false,
      "testnet": false,
      "rateLimiting": {
        "requestsPerSecond": 5,
        "burstSize": 10
      },
      "orderTypes": ["MARKET", "LIMIT"],
      "maxLeverage": 10
    }
  },
  "orderManagement": {
    "defaultTimeout": 30000,
    "maxRetries": 3,
    "partialFillHandling": true,
    "slippageProtection": 0.005
  },
  "riskControls": {
    "maxOrderSize": 10000,
    "maxDailyVolume": 100000,
    "positionLimits": {
      "phase1": 0.5,
      "phase2": 0.25,
      "phase3": 1.0
    }
  },
  "monitoring": {
    "orderLatency": true,
    "fillRates": true,
    "slippageTracking": true,
    "metricsInterval": 5000
  },
  "health": {
    "endpoint": "/health",
    "timeout": 5000,
    "checks": ["exchanges", "orderBook", "positions"]
  }
}
EOF
}

# Generate phase 1 configuration
generate_phase1_config() {
    local config_path=$1
    
    cat > "$config_path" << 'EOF'
{
  "service": {
    "name": "titan-phase1-scavenger",
    "version": "1.0.0",
    "port": 3004,
    "host": "0.0.0.0"
  },
  "strategy": {
    "name": "Predestination Trap System",
    "capitalRange": {
      "min": 200,
      "max": 5000
    },
    "leverage": {
      "min": 15,
      "max": 20,
      "default": 18
    },
    "targets": {
      "profitTarget": 0.025,
      "stopLoss": 0.015,
      "riskReward": 1.67
    }
  },
  "trapSystem": {
    "liquidationClusters": {
      "enabled": true,
      "lookbackPeriod": 24,
      "clusterThreshold": 0.002
    },
    "structuralLevels": {
      "dailyLevels": true,
      "bollingerBands": true,
      "fibonacciLevels": true
    },
    "signalValidation": {
      "binanceSpot": true,
      "volumeConfirmation": true,
      "timeFilter": true
    }
  },
  "execution": {
    "orderTypes": ["MARKET", "AGGRESSIVE_LIMIT"],
    "maxPositionSize": 0.5,
    "maxDailyTrades": 20,
    "cooldownPeriod": 300
  },
  "riskManagement": {
    "maxDrawdown": 0.07,
    "dailyLossLimit": 0.03,
    "maxConsecutiveLosses": 3,
    "emergencyStop": true
  },
  "health": {
    "endpoint": "/health",
    "timeout": 5000,
    "checks": ["strategy", "positions", "signals"]
  }
}
EOF
}

# Generate AI Quant configuration
generate_ai_quant_config() {
    local config_path=$1
    
    cat > "$config_path" << 'EOF'
{
  "service": {
    "name": "titan-ai-quant",
    "version": "1.0.0",
    "port": 3005,
    "host": "0.0.0.0"
  },
  "optimization": {
    "schedule": "0 */6 * * *",
    "lookbackPeriod": 24,
    "optimizationTargets": ["sharpe", "drawdown", "winRate"],
    "parameterRanges": {
      "leverage": [10, 25],
      "stopLoss": [0.01, 0.03],
      "profitTarget": [0.015, 0.05]
    }
  },
  "machineLearning": {
    "algorithms": ["optuna", "bayesian", "genetic"],
    "features": ["volatility", "volume", "momentum", "microstructure"],
    "trainingWindow": 168,
    "validationSplit": 0.2
  },
  "backtesting": {
    "engine": "vectorized",
    "commission": 0.0006,
    "slippage": 0.0005,
    "latency": 50
  },
  "output": {
    "configPath": "/opt/titan/config",
    "reportPath": "/opt/titan/reports",
    "format": "json"
  },
  "health": {
    "endpoint": "/health",
    "timeout": 5000,
    "checks": ["models", "data", "optimization"]
  }
}
EOF
}



# Create PM2 ecosystem configuration
create_pm2_ecosystem() {
    log "Creating PM2 ecosystem configuration..."
    
    local ecosystem_file="$PROJECT_ROOT/ecosystem.config.js"
    
    cat > "$ecosystem_file" << 'EOF'
module.exports = {
  apps: [
    {
      name: 'shared',
      script: './services/shared/dist/index.js',
      cwd: './services/shared',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        CONFIG_PATH: '../../config/shared.config.json'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      out_file: '../../logs/shared.log',
      error_file: '../../logs/shared-error.log'
    },
    {
      name: 'security',
      script: './services/security/dist/index.js',
      cwd: './services/security',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        CONFIG_PATH: '../../config/security.config.json'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      out_file: '../../logs/security.log',
      error_file: '../../logs/security-error.log'
    },
    {
      name: 'titan-brain',
      script: './services/titan-brain/dist/index.js',
      cwd: './services/titan-brain',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        CONFIG_PATH: '../../config/brain.config.json'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      out_file: '../../logs/brain.log',
      error_file: '../../logs/brain-error.log'
    },
    {
      name: 'titan-execution',
      script: './services/titan-execution/server-production.js',
      cwd: './services/titan-execution',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
        CONFIG_PATH: '../../config/execution.config.json'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      out_file: '../../logs/execution.log',
      error_file: '../../logs/execution-error.log'
    },
    {
      name: 'titan-phase1-scavenger',
      script: './services/titan-phase1-scavenger/dist/index.js',
      cwd: './services/titan-phase1-scavenger',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        PORT: 3004,
        CONFIG_PATH: '../../config/phase1.config.json'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      out_file: '../../logs/scavenger.log',
      error_file: '../../logs/scavenger-error.log'
    },
    {
      name: 'titan-ai-quant',
      script: './services/titan-ai-quant/dist/index.js',
      cwd: './services/titan-ai-quant',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
        PORT: 3005,
        CONFIG_PATH: '../../config/ai-quant.config.json'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      out_file: '../../logs/ai-quant.log',
      error_file: '../../logs/ai-quant-error.log'
    },

  ]
};
EOF
    
    success "PM2 ecosystem configuration created: $ecosystem_file"
}

# Create environment configuration
create_environment_config() {
    log "Creating environment configuration..."
    
    local env_file="$CONFIG_DIR/deployment/production.env"
    
    cat > "$env_file" << 'EOF'
# Titan Production Environment Configuration

# Node.js Configuration
NODE_ENV=production
LOG_LEVEL=info
DEBUG=titan:*

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=

# Database Configuration (for Brain service)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=titan_brain
DB_USER=titan
DB_PASSWORD=

# Security Configuration
ENCRYPTION_KEY=
JWT_SECRET=
API_KEY_ROTATION_INTERVAL=2592000

# Exchange API Configuration (encrypted)
BYBIT_API_KEY=
BYBIT_API_SECRET=
MEXC_API_KEY=
MEXC_API_SECRET=

# Monitoring Configuration
METRICS_ENABLED=true
HEALTH_CHECK_ENABLED=true
PROMETHEUS_PORT=9090
GRAFANA_PORT=3000

# Alerting Configuration
ALERT_EMAIL=
SLACK_WEBHOOK_URL=
DISCORD_WEBHOOK_URL=

# Deployment Configuration
ROLLBACK_ON_FAILURE=true
HEALTH_CHECK_TIMEOUT=30
SERVICE_START_TIMEOUT=30
VALIDATION_TIMEOUT=60

# Service Ports
SHARED_PORT=3001
SECURITY_PORT=3002
BRAIN_PORT=3000
EXECUTION_PORT=3003
SCAVENGER_PORT=3004
AI_QUANT_PORT=3005

EOF
    
    success "Environment configuration created: $env_file"
    warning "Please update the configuration with your actual API keys and secrets"
}

# Validate service configurations
validate_configurations() {
    log "Validating service configurations..."
    
    local errors=0
    
    # Check if all configuration files exist
    for service_name in "${!SERVICE_CONFIGS[@]}"; do
        local config_file="${SERVICE_CONFIGS[$service_name]}"
        local config_path="$CONFIG_DIR/$config_file"
        
        if [[ ! -f "$config_path" ]]; then
            error "Configuration file not found: $config_path"
            ((errors++))
        else
            # Validate JSON syntax
            if ! jq empty "$config_path" 2>/dev/null; then
                error "Invalid JSON in configuration file: $config_path"
                ((errors++))
            else
                success "Configuration validated: $config_file"
            fi
        fi
    done
    
    # Check PM2 ecosystem file
    if [[ ! -f "$PROJECT_ROOT/ecosystem.config.js" ]]; then
        error "PM2 ecosystem file not found"
        ((errors++))
    else
        # Basic syntax check for JavaScript
        if ! node -c "$PROJECT_ROOT/ecosystem.config.js" 2>/dev/null; then
            error "Invalid syntax in PM2 ecosystem file"
            ((errors++))
        else
            success "PM2 ecosystem configuration validated"
        fi
    fi
    
    if [[ $errors -eq 0 ]]; then
        success "All configurations validated successfully"
        return 0
    else
        error "Configuration validation failed with $errors error(s)"
        return 1
    fi
}

# Main configuration function
main() {
    log "Starting Titan Services Configuration..."
    
    # Create directories
    create_config_directories
    
    # Generate service configurations
    for service_name in "${!SERVICE_CONFIGS[@]}"; do
        local config_file="${SERVICE_CONFIGS[$service_name]}"
        generate_service_config "$service_name" "$config_file"
    done
    
    # Create PM2 ecosystem
    create_pm2_ecosystem
    
    # Create environment configuration
    create_environment_config
    
    # Validate configurations
    if validate_configurations; then
        success "Titan Services Configuration completed successfully!"
        
        echo ""
        log "Configuration Summary:"
        log "- Service configurations: ${#SERVICE_CONFIGS[@]} files created"
        log "- PM2 ecosystem: ecosystem.config.js created"
        log "- Environment config: production.env created"
        
        echo ""
        log "Next steps:"
        log "1. Update production.env with your API keys and secrets"
        log "2. Review and customize service configurations as needed"
        log "3. Run the deployment script: ./scripts/deploy-titan-production.sh"
        
        return 0
    else
        error "Configuration validation failed"
        return 1
    fi
}

# Display usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
    --config-dir DIR      Use custom configuration directory (default: config)
    --services-dir DIR    Use custom services directory (default: services)
    -h, --help           Show this help message

Examples:
    $0                                    # Standard configuration generation
    $0 --config-dir /etc/titan           # Use custom config directory

This script will:
1. Create configuration directory structure
2. Generate service-specific configuration files
3. Create PM2 ecosystem configuration
4. Create production environment configuration
5. Validate all generated configurations

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --config-dir)
                CONFIG_DIR="$2"
                shift 2
                ;;
            --services-dir)
                SERVICES_DIR="$2"
                shift 2
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
}

# Main execution
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         TITAN SERVICES CONFIGURATION                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

parse_args "$@"
main