#!/bin/bash

# Refactoring Audit Script
# Scans ALL directories for code quality and architectural issues.

OUTPUT_FILE="reports/refactoring_audit_raw.txt"
mkdir -p reports
echo "Refactoring Audit Started: $(date)" > "$OUTPUT_FILE"
echo "==================================================" >> "$OUTPUT_FILE"

echo "Phase 1: Static Analysis (Linting)" | tee -a "$OUTPUT_FILE"
echo "--------------------------------------------------" >> "$OUTPUT_FILE"
# Check if npm is installed and package.json exists
if [ -f "package.json" ]; then
    echo "Running npm run lint:all..." >> "$OUTPUT_FILE"
    npm run lint:all >> "$OUTPUT_FILE" 2>&1 || echo "Linting found issues (see above)" >> "$OUTPUT_FILE"
else
    echo "No package.json found, skipping npm lint." >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

echo "Phase 2: Architectural Consistency (Grep)" | tee -a "$OUTPUT_FILE"
echo "--------------------------------------------------" >> "$OUTPUT_FILE"

# Exclude list for grep
EXCLUDES="--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build --exclude-dir=.legacy --exclude=package-lock.json --exclude=*.map --exclude-dir=logs --exclude-dir=backups --exclude-dir=data --exclude-dir=tmp --exclude-dir=monitoring --exclude-dir=.gemini --exclude-dir=.do"

echo "[Check] Direct console.log usage (should use Logger):" >> "$OUTPUT_FILE"
grep -r $EXCLUDES "console.log" . >> "$OUTPUT_FILE" || echo "None found." >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "[Check] Direct console.error usage (should use Logger):" >> "$OUTPUT_FILE"
grep -r $EXCLUDES "console.error" . >> "$OUTPUT_FILE" || echo "None found." >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "[Check] Local dotenv/config usage (should use ConfigManager):" >> "$OUTPUT_FILE"
grep -r $EXCLUDES "dotenv" . >> "$OUTPUT_FILE" || echo "None found." >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "[Check] Direct process.env usage (should use ConfigManager):" >> "$OUTPUT_FILE"
grep -r $EXCLUDES "process.env" . >> "$OUTPUT_FILE" || echo "None found." >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "Phase 3: Code Hygiene & Patterns" | tee -a "$OUTPUT_FILE"
echo "--------------------------------------------------" >> "$OUTPUT_FILE"

echo "[Check] TODO/FIXME comments:" >> "$OUTPUT_FILE"
grep -r $EXCLUDES -E "TODO|FIXME|XXX|HACK" . >> "$OUTPUT_FILE" || echo "None found." >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "[Check] 'any' type usage (TypeScript):" >> "$OUTPUT_FILE"
grep -r $EXCLUDES ": any" . >> "$OUTPUT_FILE" || echo "None found." >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "[Check] Hardcoded Secrets (Potential):" >> "$OUTPUT_FILE"
grep -r $EXCLUDES -E "API_KEY|SECRET|PASSWORD|token" . | grep -v "process.env" | grep -v "Config" >> "$OUTPUT_FILE" || echo "None found." >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "[Check] Unused Scripts (scripts/ directory):" >> "$OUTPUT_FILE"
ls -l scripts/ >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "Refactoring Audit Completed: $(date)" >> "$OUTPUT_FILE"
echo "Audit saved to $OUTPUT_FILE"
