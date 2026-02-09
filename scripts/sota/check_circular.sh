#!/bin/bash
# Check for circular dependencies using Madge
# Target all services (ts files)
echo "🛡️  Running Circular Dependency Check..."
npx madge --circular --extensions ts,tsx services/titan-brain/src services/titan-phase1-scavenger/src services/titan-phase2-hunter/src services/titan-phase3-sentinel/src packages/shared/src apps/titan-console/src
