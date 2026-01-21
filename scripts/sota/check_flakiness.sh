#!/bin/bash
# Run tests multiple times to detect flakiness
COUNT=${1:-10}
echo "❄️ Running Flakiness Detector ($COUNT runs)..."
echo "Targeting core services tests..."

# We run test:all which might be slow. 
# Better to allow passing a specific service argument.
CMD="npm run test"

for i in $(seq 1 $COUNT)
do
   echo -ne "Run $i/$COUNT... \r"
   # Capture output to file to analyze if fails
   $CMD > flake_output.log 2>&1
   if [ $? -ne 0 ]; then
     echo ""
     echo "❌ Flake detected on run $i!"
     tail -n 20 flake_output.log
     exit 1
   fi
done
echo ""
echo "✅ No flakes found in $COUNT runs."
rm flake_output.log
