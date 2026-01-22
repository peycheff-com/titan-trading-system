#!/bin/bash
set -e

# Titan Trading System - Database Maintenance Script
# Usage: ./maintenance.sh

echo "[$(date)] Starting maintenance..."

# Run VACUUM ANALYZE to optimize query planner and reclaim space
echo "[$(date)] Running VACUUM ANALYZE..."
docker exec titan-postgres psql -U postgres -d titan_brain_production -c "VACUUM ANALYZE;"

# specific optimization for high-churn tables
echo "[$(date)] Analyzing partitions..."
docker exec titan-postgres psql -U postgres -d titan_brain_production -c "ANALYZE fills;"
docker exec titan-postgres psql -U postgres -d titan_brain_production -c "ANALYZE event_log;"

# Run Retention Policy Procedure
echo "[$(date)] Executing retention policy logic..."
docker exec titan-postgres psql -U postgres -d titan_brain_production -c "SELECT maintain_retention_policy();"

echo "[$(date)] Maintenance completed."
