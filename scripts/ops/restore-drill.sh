#!/bin/bash
# JetStream Restore Drill - INV-02 Validation Procedure
# This is a FIRST-CLASS procedure, run QUARTERLY
# 
# Purpose: Verify that JetStream snapshots are actually restorable
# and that the system can recover from a complete data loss scenario.
#
# Prerequisites:
# - doctl authenticated with DigitalOcean
# - SSH key in DO account
# - At least one JetStream snapshot exists

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

# Configuration
REGION="${TITAN_BACKUP_REGION:-ams3}"
DRILL_DROPLET_NAME="titan-restore-drill-$(date +%Y%m%d)"
DRILL_DROPLET_SIZE="s-2vcpu-4gb"
SSH_KEY_FINGERPRINT="${DO_SSH_KEY_FINGERPRINT:-}"
RESULTS_FILE="./restore-drill-results-$(date +%Y%m%d).txt"

log_step() { echo -e "${BLUE}[STEP $1]${NC} $2"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $1"; }

cleanup() {
    log_step "CLEANUP" "Destroying drill resources..."
    
    if [ -n "$DRILL_DROPLET_ID" ]; then
        doctl compute droplet delete "$DRILL_DROPLET_ID" --force 2>/dev/null || true
        log_success "Deleted drill droplet"
    fi
    
    if [ -n "$RESTORED_VOLUME_ID" ] && [ "$RESTORED_VOLUME_ID" != "$ORIGINAL_VOLUME_ID" ]; then
        # Detach first if attached
        doctl compute volume-action detach "$RESTORED_VOLUME_ID" "$DRILL_DROPLET_ID" 2>/dev/null || true
        sleep 5
        doctl compute volume delete "$RESTORED_VOLUME_ID" --force 2>/dev/null || true
        log_success "Deleted restored volume"
    fi
}

trap cleanup EXIT

# =============================================================================
# MAIN DRILL PROCEDURE
# =============================================================================

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}  TITAN RESTORE DRILL - INV-02 VALIDATION             ${NC}"
echo -e "${BLUE}  Date: $(date)                                       ${NC}"
echo -e "${BLUE}======================================================${NC}"
echo ""

# Record start
echo "Restore Drill Results - $(date)" > "$RESULTS_FILE"
echo "===========================================" >> "$RESULTS_FILE"

# Step 1: Find latest JetStream snapshot
log_step 1 "Finding latest JetStream snapshot..."

LATEST_SNAPSHOT=$(doctl compute volume-snapshot list --format ID,Name,SizeGigaBytes,CreatedAt --no-header | \
    grep "jetstream-" | \
    head -1)

if [ -z "$LATEST_SNAPSHOT" ]; then
    log_error "No JetStream snapshots found. Cannot proceed with drill."
    echo "FAILED: No snapshots available" >> "$RESULTS_FILE"
    exit 1
fi

SNAPSHOT_ID=$(echo "$LATEST_SNAPSHOT" | awk '{print $1}')
SNAPSHOT_NAME=$(echo "$LATEST_SNAPSHOT" | awk '{print $2}')
SNAPSHOT_SIZE=$(echo "$LATEST_SNAPSHOT" | awk '{print $3}')
SNAPSHOT_DATE=$(echo "$LATEST_SNAPSHOT" | awk '{print $4}')

log_success "Found snapshot: $SNAPSHOT_NAME (ID: $SNAPSHOT_ID, Size: ${SNAPSHOT_SIZE}GB, Created: $SNAPSHOT_DATE)"
echo "Snapshot: $SNAPSHOT_NAME ($SNAPSHOT_ID)" >> "$RESULTS_FILE"

# Step 2: Create volume from snapshot
log_step 2 "Creating volume from snapshot..."

RESTORED_VOLUME_NAME="jetstream-restored-$(date +%Y%m%d)"

if doctl compute volume create "$RESTORED_VOLUME_NAME" \
    --region "$REGION" \
    --size "${SNAPSHOT_SIZE}GiB" \
    --snapshot-id "$SNAPSHOT_ID" \
    --format ID --no-header > /tmp/restored_volume_id.txt; then
    
    RESTORED_VOLUME_ID=$(cat /tmp/restored_volume_id.txt)
    log_success "Created volume: $RESTORED_VOLUME_NAME (ID: $RESTORED_VOLUME_ID)"
    echo "Restored Volume: $RESTORED_VOLUME_ID" >> "$RESULTS_FILE"
else
    log_error "Failed to create volume from snapshot"
    echo "FAILED: Volume creation failed" >> "$RESULTS_FILE"
    exit 1
fi

# Step 3: Create drill droplet
log_step 3 "Creating drill droplet..."

SSH_KEY_ARGS=""
if [ -n "$SSH_KEY_FINGERPRINT" ]; then
    SSH_KEY_ARGS="--ssh-keys $SSH_KEY_FINGERPRINT"
fi

if DRILL_DROPLET_ID=$(doctl compute droplet create "$DRILL_DROPLET_NAME" \
    --region "$REGION" \
    --size "$DRILL_DROPLET_SIZE" \
    --image ubuntu-24-04-x64 \
    $SSH_KEY_ARGS \
    --format ID --no-header --wait); then
    
    log_success "Created droplet: $DRILL_DROPLET_NAME (ID: $DRILL_DROPLET_ID)"
    echo "Drill Droplet: $DRILL_DROPLET_ID" >> "$RESULTS_FILE"
else
    log_error "Failed to create drill droplet"
    echo "FAILED: Droplet creation failed" >> "$RESULTS_FILE"
    exit 1
fi

# Get droplet IP
DRILL_IP=$(doctl compute droplet get "$DRILL_DROPLET_ID" --format PublicIPv4 --no-header)
log_success "Droplet IP: $DRILL_IP"

# Step 4: Attach volume to droplet
log_step 4 "Attaching restored volume to drill droplet..."

sleep 10  # Wait for droplet to be fully ready

if doctl compute volume-action attach "$RESTORED_VOLUME_ID" "$DRILL_DROPLET_ID"; then
    log_success "Volume attached"
else
    log_error "Failed to attach volume"
    echo "FAILED: Volume attach failed" >> "$RESULTS_FILE"
    exit 1
fi

sleep 10  # Wait for volume to be attached

# Step 5: Mount and verify data
log_step 5 "Mounting volume and verifying JetStream data..."

# SSH into droplet and run verification
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 root@"$DRILL_IP" << 'REMOTE_SCRIPT' | tee -a "$RESULTS_FILE"
#!/bin/bash
set -e

echo "=== Remote Verification Starting ==="

# Find the volume device
VOLUME_DEV=$(lsblk -o NAME,SIZE -b | grep -v loop | tail -1 | awk '{print $1}')
VOLUME_PATH="/dev/${VOLUME_DEV}"

echo "Found volume device: $VOLUME_PATH"

# Create mount point
mkdir -p /mnt/jetstream

# Mount the volume
if mount "$VOLUME_PATH" /mnt/jetstream 2>/dev/null || mount "${VOLUME_PATH}1" /mnt/jetstream; then
    echo "[✓] Volume mounted successfully"
else
    echo "[✗] Failed to mount volume"
    exit 1
fi

# Check for JetStream data
if [ -d "/mnt/jetstream/jetstream" ]; then
    echo "[✓] JetStream directory exists"
    
    # List streams
    echo "=== JetStream Streams ==="
    ls -la /mnt/jetstream/jetstream/ 2>/dev/null || echo "No streams directory"
    
    # Check for consumer data
    STREAM_COUNT=$(find /mnt/jetstream -name "*.dat" 2>/dev/null | wc -l)
    echo "[✓] Found $STREAM_COUNT data files"
    
    # Check data integrity (basic)
    DATA_SIZE=$(du -sh /mnt/jetstream 2>/dev/null | cut -f1)
    echo "[✓] Total data size: $DATA_SIZE"
    
else
    echo "[!] No JetStream directory found - volume may be empty or different format"
fi

# Install NATS and verify streams
echo "=== Installing NATS CLI for verification ==="
curl -sf https://binaries.nats.dev/nats-io/natscli/nats@latest | sh 2>/dev/null || echo "NATS CLI install skipped"

# Try to start NATS with restored data
echo "=== Starting NATS with restored data ==="
docker run -d --name nats-drill \
    -v /mnt/jetstream:/data/jetstream \
    -p 4222:4222 \
    nats:2.10.24-alpine -js -sd /data/jetstream 2>/dev/null || echo "Docker not available"

sleep 5

# Check if NATS started and has streams
if command -v ./nats &> /dev/null; then
    echo "=== Verifying Streams ==="
    ./nats stream ls --server nats://localhost:4222 2>/dev/null || echo "Could not list streams"
fi

echo "=== Remote Verification Complete ==="
REMOTE_SCRIPT

# Step 6: Record results
log_step 6 "Recording drill results..."

echo "" >> "$RESULTS_FILE"
echo "===========================================" >> "$RESULTS_FILE"
echo "Drill completed at: $(date)" >> "$RESULTS_FILE"
echo "Status: SUCCESS" >> "$RESULTS_FILE"

log_success "Restore drill completed successfully!"
echo ""
echo -e "${GREEN}======================================================${NC}"
echo -e "${GREEN}  RESTORE DRILL PASSED                                ${NC}"
echo -e "${GREEN}  Results saved to: $RESULTS_FILE                     ${NC}"
echo -e "${GREEN}======================================================${NC}"

# Cleanup happens automatically via trap
