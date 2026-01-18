#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=== Titan Database Backup Tool ===${NC}"

# Check for pg_dump
if ! command -v pg_dump &> /dev/null; then
    echo -e "${RED}Error: pg_dump is not installed.${NC}"
    exit 1
fi

# Configuration
DB_HOST=${TITAN_DB_HOST:-"localhost"}
DB_PORT=${TITAN_DB_PORT:-"5432"}
DB_USER=${TITAN_DB_USER:-"postgres"}
DB_PASS=${TITAN_DB_PASSWORD:-"postgres"}
DB_NAME=${TITAN_DB_NAME:-"titan_brain"}
BACKUP_DIR="./backups"

# Create backup directory
mkdir -p "${BACKUP_DIR}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/titan_backup_${TIMESTAMP}.dump"

echo -e "Target Database: ${GREEN}postgres://${DB_USER}:****@${DB_HOST}:${DB_PORT}/${DB_NAME}${NC}"
echo -e "Backup File: ${BACKUP_FILE}"

# Export password
export PGPASSWORD="${DB_PASS}"

echo -e "${BLUE}Backing up...${NC}"

if pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -Fc -f "${BACKUP_FILE}"; then
    echo -e "${GREEN}✅ Backup successful!${NC}"
    echo -e "Size: $(du -h "${BACKUP_FILE}" | cut -f1)"
else
    echo -e "${RED}❌ Backup failed.${NC}"
    exit 1
fi

# Cleanup old backups (keep last 5)
cd "${BACKUP_DIR}"
ls -t titan_backup_*.dump | tail -n +6 | xargs -I {} rm -- {} 2>/dev/null || true
echo -e "${BLUE}Cleaned up old backups (kept last 5)${NC}"
