#!/bin/bash

# Automated Rollback Script for Titan Trading System
# Requirements: 7.1 - Automated rollback on deployment failures

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Parse command line arguments
DEPLOYMENT_ID=""
ROLLBACK_TO=""
FORCE_ROLLBACK=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --deployment-id)
            DEPLOYMENT_ID="$2"
            shift 2
            ;;
        --rollback-to)
            ROLLBACK_TO="$2"
            shift 2
            ;;
        --force)
            FORCE_ROLLBACK=true
            shift
            ;;
        --list)
            LIST_DEPLOYMENTS=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --deployment-id ID    Rollback specific deployment"
            echo "  --rollback-to ID      Rollback to specific deployment"
            echo "  --force              Force rollback without confirmation"
            echo "  --list               List available rollback points"
            echo "  -h, --help           Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo -e "${PURPLE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║         TITAN TRADING SYSTEM - AUTOMATED ROLLBACK          ║${NC}"
echo -e "${PURPLE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to list available rollback points
list_rollback_points() {
    echo -e "${BLUE}📋 Available Rollback Points:${NC}"
    echo ""
    
    # List database backups
    if [ -d "services/titan-execution" ]; then
        echo -e "${BLUE}Database Backups (Execution):${NC}"
        find services/titan-execution -name "*.db.backup-*" -type f 2>/dev/null | while read backup; do
            local backup_id=$(basename "$backup" | sed 's/.*backup-//' | sed 's/\.db$//')
            local backup_date=$(date -r "$backup" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "Unknown")
            local backup_size=$(du -h "$backup" 2>/dev/null | cut -f1 || echo "Unknown")
            echo -e "   • ID: $backup_id"
            echo -e "     Date: $backup_date"
            echo -e "     Size: $backup_size"
            echo -e "     File: $backup"
            echo ""
        done
    fi
    
    # List configuration backups
    if [ -d ".deployment-configs" ]; then
        echo -e "${BLUE}Configuration Backups:${NC}"
        find .deployment-configs -name "current-*.env" -type f 2>/dev/null | while read config; do
            local config_id=$(basename "$config" | sed 's/current-//' | sed 's/\.env$//')
            local config_date=$(date -r "$config" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "Unknown")
            echo -e "   • ID: $config_id"
            echo -e "     Date: $config_date"
            echo -e "     File: $config"
            echo ""
        done
    fi
    
    # List service backups
    if [ -d ".deployment-backup-"* ] 2>/dev/null; then
        echo -e "${BLUE}Service Backups:${NC}"
        for backup_dir in .deployment-backup-*; do
            if [ -d "$backup_dir" ]; then
                local backup_id=$(echo "$backup_dir" | sed 's/\.deployment-backup-//')
                local backup_date=$(date -r "$backup_dir" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "Unknown")
                echo -e "   • ID: $backup_id"
                echo -e "     Date: $backup_date"
                echo -e "     Directory: $backup_dir"
                echo ""
            fi
        done
    fi
}

# Function to validate rollback point
validate_rollback_point() {
    local rollback_id=$1
    
    echo -e "${BLUE}🔍 Validating rollback point: $rollback_id${NC}"
    
    # Check if database backup exists
    local db_backup="services/titan-execution/titan_execution.db.backup-$rollback_id"
    if [ -f "$db_backup" ]; then
        echo -e "${GREEN}   ✓ Database backup found${NC}"
    else
        echo -e "${YELLOW}   ⚠ Database backup not found${NC}"
    fi
    
    # Check if configuration backup exists
    local config_backup=".deployment-configs/current-$rollback_id.env"
    if [ -f "$config_backup" ]; then
        echo -e "${GREEN}   ✓ Configuration backup found${NC}"
    else
        echo -e "${YELLOW}   ⚠ Configuration backup not found${NC}"
    fi
    
    # Check if service backup exists
    local service_backup=".deployment-backup-$rollback_id"
    if [ -d "$service_backup" ]; then
        echo -e "${GREEN}   ✓ Service backup found${NC}"
    else
        echo -e "${YELLOW}   ⚠ Service backup not found${NC}"
    fi
    
    return 0
}

# Function to perform rollback
perform_rollback() {
    local rollback_id=$1
    
    echo -e "${BLUE}🔄 Starting rollback to deployment: $rollback_id${NC}"
    
    # Step 1: Stop current services
    echo -e "${BLUE}🛑 Stopping current services...${NC}"
    ./stop-titan.sh 2>/dev/null || true
    sleep 3
    
    # Step 2: Restore databases
    echo -e "${BLUE}💾 Restoring databases...${NC}"
    
    # Restore execution database
    local exec_backup="services/titan-execution/titan_execution.db.backup-$rollback_id"
    if [ -f "$exec_backup" ]; then
        echo -e "${BLUE}   Restoring execution database...${NC}"
        cp "$exec_backup" "services/titan-execution/titan_execution.db"
        echo -e "${GREEN}   ✓ Execution database restored${NC}"
    fi
    
    # Restore brain database
    local brain_backup="services/titan-brain/brain.db.backup-$rollback_id"
    if [ -f "$brain_backup" ]; then
        echo -e "${BLUE}   Restoring brain database...${NC}"
        cp "$brain_backup" "services/titan-brain/brain.db"
        echo -e "${GREEN}   ✓ Brain database restored${NC}"
    fi
    
    # Step 3: Restore configurations
    echo -e "${BLUE}⚙️ Restoring configurations...${NC}"
    
    local config_backup=".deployment-configs/current-$rollback_id.env"
    if [ -f "$config_backup" ]; then
        # Determine environment from backup
        local env=$(grep "NODE_ENV=" "$config_backup" | cut -d'=' -f2)
        if [ -n "$env" ]; then
            cp "$config_backup" "config/deployment/$env.env"
            echo -e "${GREEN}   ✓ Configuration restored for environment: $env${NC}"
        fi
    fi
    
    # Step 4: Restore service files
    echo -e "${BLUE}📁 Restoring service files...${NC}"
    
    local service_backup=".deployment-backup-$rollback_id"
    if [ -d "$service_backup" ]; then
        # Restore package.json files and other configs
        find "$service_backup" -name "package.json" -o -name "*.env" -o -name "*.config.js" | while read file; do
            local relative_path=$(echo "$file" | sed "s|$service_backup/||")
            local target_dir=$(dirname "$relative_path")
            
            if [ "$target_dir" != "." ]; then
                mkdir -p "$target_dir"
            fi
            
            cp "$file" "$relative_path"
            echo -e "${GREEN}   ✓ Restored: $relative_path${NC}"
        done
    fi
    
    # Step 5: Reinstall dependencies if package.json changed
    echo -e "${BLUE}📦 Checking dependencies...${NC}"
    
    for service_dir in services/*/; do
        if [ -f "$service_dir/package.json" ] && [ -d "$service_dir" ]; then
            echo -e "${BLUE}   Checking $service_dir...${NC}"
            cd "$service_dir"
            
            # Check if node_modules is older than package.json
            if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
                echo -e "${BLUE}   Installing dependencies for $(basename "$service_dir")...${NC}"
                npm install --production
                echo -e "${GREEN}   ✓ Dependencies updated${NC}"
            fi
            
            # Rebuild if needed
            if [ -f "tsconfig.json" ]; then
                echo -e "${BLUE}   Building TypeScript for $(basename "$service_dir")...${NC}"
                npm run build 2>/dev/null || npx tsc
                echo -e "${GREEN}   ✓ TypeScript built${NC}"
            fi
            
            cd - >/dev/null
        fi
    done
    
    # Step 6: Verify rollback integrity
    echo -e "${BLUE}🔍 Verifying rollback integrity...${NC}"
    
    # Check database integrity
    if [ -f "services/titan-execution/titan_execution.db" ]; then
        if sqlite3 "services/titan-execution/titan_execution.db" "PRAGMA integrity_check;" | grep -q "ok"; then
            echo -e "${GREEN}   ✓ Execution database integrity verified${NC}"
        else
            echo -e "${RED}   ❌ Execution database integrity check failed${NC}"
            return 1
        fi
    fi
    
    # Step 7: Start services with rollback configuration
    echo -e "${BLUE}🚀 Starting services with rollback configuration...${NC}"
    
    # Load the rollback configuration
    if [ -f "$config_backup" ]; then
        source "$config_backup"
    fi
    
    # Start services using the standard startup script
    ./start-titan.sh
    
    echo -e "${GREEN}✅ Rollback completed successfully${NC}"
    
    # Step 8: Create rollback record
    echo -e "${BLUE}📝 Recording rollback...${NC}"
    
    local rollback_record="rollbacks/rollback-$(date +%s).log"
    mkdir -p "rollbacks"
    
    cat > "$rollback_record" << EOF
Rollback Record
===============
Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Rollback ID: $rollback_id
Rollback To: $rollback_id
Performed By: $(whoami)
Hostname: $(hostname)
Reason: Manual rollback

Files Restored:
$(find . -name "*.backup-$rollback_id" -o -name "*$rollback_id*" 2>/dev/null | head -20)

Status: SUCCESS
EOF
    
    echo -e "${GREEN}   ✓ Rollback recorded in: $rollback_record${NC}"
}

# Main execution
if [ "$LIST_DEPLOYMENTS" = "true" ]; then
    list_rollback_points
    exit 0
fi

# Determine rollback target
if [ -n "$ROLLBACK_TO" ]; then
    DEPLOYMENT_ID="$ROLLBACK_TO"
elif [ -z "$DEPLOYMENT_ID" ]; then
    # Find the most recent deployment
    DEPLOYMENT_ID=$(find . -name "*.backup-*" -type f 2>/dev/null | sed 's/.*backup-//' | sed 's/\..*$//' | sort -n | tail -1)
    
    if [ -z "$DEPLOYMENT_ID" ]; then
        echo -e "${RED}❌ No deployment ID specified and no backups found${NC}"
        echo -e "${YELLOW}Use --list to see available rollback points${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}🎯 Auto-detected most recent deployment: $DEPLOYMENT_ID${NC}"
fi

# Validate rollback point
if ! validate_rollback_point "$DEPLOYMENT_ID"; then
    echo -e "${RED}❌ Invalid rollback point: $DEPLOYMENT_ID${NC}"
    exit 1
fi

# Confirmation (unless forced)
if [ "$FORCE_ROLLBACK" != "true" ]; then
    echo -e "${YELLOW}⚠ This will rollback to deployment: $DEPLOYMENT_ID${NC}"
    echo -e "${YELLOW}   Current services will be stopped and replaced${NC}"
    echo -e "${YELLOW}   Databases will be restored from backup${NC}"
    echo ""
    read -p "Are you sure you want to proceed? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}Rollback cancelled${NC}"
        exit 0
    fi
fi

# Perform rollback
if perform_rollback "$DEPLOYMENT_ID"; then
    echo -e "\n${GREEN}🎉 Rollback completed successfully${NC}"
    echo -e "${GREEN}   System has been restored to deployment: $DEPLOYMENT_ID${NC}"
    exit 0
else
    echo -e "\n${RED}💥 Rollback failed${NC}"
    echo -e "${RED}   Manual intervention may be required${NC}"
    exit 1
fi