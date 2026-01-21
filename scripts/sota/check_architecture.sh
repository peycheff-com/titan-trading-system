#!/bin/bash
# Check architectural boundaries
echo "🏰 Running Architectural Fitness Check..."
npx depcruise --validate .dependency-cruiser.js services/titan-brain/src services/titan-phase1-scavenger/src services/titan-phase2-hunter/src services/titan-phase3-sentinel/src services/titan-ai-quant/src
