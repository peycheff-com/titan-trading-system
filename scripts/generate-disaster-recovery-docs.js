#!/usr/bin/env node

/**
 * Generate Disaster Recovery Documentation
 * 
 * This script generates comprehensive disaster recovery documentation
 * including runbooks, procedures, and quick reference guides.
 * 
 * Usage: node scripts/generate-disaster-recovery-docs.js [output-dir]
 * 
 * Requirements: 10.1
 */

const { DisasterRecoveryDocumentation } = require('../services/deployment/DisasterRecoveryDocumentation');
const path = require('path');
const fs = require('fs');

/**
 * Simple template engine for replacing placeholders
 * @param {string} template - Template string with {{PLACEHOLDER}} syntax
 * @param {Object} variables - Key-value pairs for replacement
 * @returns {string} - Processed template
 */
function processTemplate(template, variables = {}) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return variables[key] || match;
    });
}

/**
 * Generate RTO table from configuration
 * @returns {string} - Markdown table
 */
function generateRTOTable() {
    const header = '| Scenario | Target RTO | Maximum RTO |\n|----------|------------|-------------|';
    const rows = Object.entries(CONFIG.RTO_TARGETS)
        .map(([scenario, rto]) => `| ${scenario} | ${rto.target} | ${rto.maximum} |`)
        .join('\n');
    return `${header}\n${rows}`;
}

/**
 * Utility function to write template files
 * @param {string} filePath - Full path to the file
 * @param {string} content - File content
 * @param {string} description - Description for logging
 */
function writeTemplate(filePath, content, description) {
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✓ Generated ${description}: ${path.basename(filePath)}`);
    } catch (error) {
        console.error(`✗ Failed to generate ${description}:`, error.message);
        throw error;
    }
}

// Configuration
const CONFIG = {
    DEFAULT_OUTPUT_DIR: './docs/disaster-recovery',
    PROJECT_ROOT: path.dirname(__dirname),
    TEMPLATES_SUBDIR: 'recovery-templates',
    RTO_TARGETS: {
        'Complete System Failure': { target: '10 minutes', maximum: '15 minutes' },
        'Database Corruption': { target: '5 minutes', maximum: '10 minutes' },
        'Network Partition': { target: '2 minutes', maximum: '5 minutes' },
        'Configuration Corruption': { target: '5 minutes', maximum: '8 minutes' }
    }
};

/**
 * Validate and parse command line arguments
 * @returns {Object} - Parsed arguments
 */
function parseArguments() {
    const args = process.argv.slice(2);
    
    // Handle help flag
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Usage: node ${path.basename(__filename)} [output-dir] [options]

Arguments:
  output-dir    Output directory for generated documentation (default: ${CONFIG.DEFAULT_OUTPUT_DIR})

Options:
  --help, -h    Show this help message
  --verbose, -v Enable verbose logging

Examples:
  node ${path.basename(__filename)}
  node ${path.basename(__filename)} ./custom-docs
  node ${path.basename(__filename)} --verbose
        `);
        process.exit(0);
    }
    
    const outputDir = args.find(arg => !arg.startsWith('--')) || CONFIG.DEFAULT_OUTPUT_DIR;
    const verbose = args.includes('--verbose') || args.includes('-v');
    
    return { outputDir, verbose };
}

/**
 * Main execution function
 */
async function main() {
    try {
        // Parse command line arguments
        const { outputDir, verbose } = parseArguments();
        const fullOutputPath = path.resolve(CONFIG.PROJECT_ROOT, outputDir);
        
        // Validate output directory
        if (!path.isAbsolute(fullOutputPath) && !fullOutputPath.startsWith(CONFIG.PROJECT_ROOT)) {
            throw new Error('Output directory must be within project root for security');
        }
        
        console.log('🚨 Generating Disaster Recovery Documentation...');
        console.log(`📁 Output Directory: ${fullOutputPath}`);
        
        // Create documentation generator
        const docGenerator = new DisasterRecoveryDocumentation(fullOutputPath);
        
        // Generate all documentation
        await docGenerator.generateDocumentation();
        
        // Generate additional scripts and templates
        await generateAdditionalScripts(fullOutputPath);
        
        console.log('✅ Disaster Recovery Documentation generated successfully!');
        
        // List generated files
        const generatedFiles = [
            'disaster-recovery-guide.md (Main guide)',
            'complete-system-failure-runbook.md',
            'database-corruption-runbook.md', 
            'network-partition-runbook.md',
            'configuration-corruption-runbook.md',
            'system-components.md',
            'quick-reference.md',
            'emergency-checklist.md',
            'recovery-templates/'
        ];
        
        console.log('\n📚 Generated Files:');
        generatedFiles.forEach(file => console.log(`   - ${file}`));
        
        console.log('\n🔧 Next Steps:');
        console.log('   1. Review generated documentation');
        console.log('   2. Customize emergency contacts and procedures');
        console.log('   3. Test disaster recovery procedures');
        console.log('   4. Schedule monthly DR tests');
        
    } catch (error) {
        console.error('❌ Error generating disaster recovery documentation:', error.message);
        process.exit(1);
    }
}

/**
 * Generate additional scripts and templates
 * @param {string} outputDir - Output directory path
 * @throws {Error} - If template generation fails
 */
async function generateAdditionalScripts(outputDir) {
    // Create templates directory
    const templatesDir = path.join(outputDir, CONFIG.TEMPLATES_SUBDIR);
    if (!fs.existsSync(templatesDir)) {
        fs.mkdirSync(templatesDir, { recursive: true });
    }
    
    // Template configurations
    const templates = [
        { generator: generateEmergencyChecklist, dir: outputDir },
        { generator: generateIncidentReportTemplate, dir: templatesDir },
        { generator: generateRecoveryLogTemplate, dir: templatesDir },
        { generator: generatePostIncidentReviewTemplate, dir: templatesDir }
    ];
    
    // Generate all templates
    await Promise.all(templates.map(({ generator, dir }) => generator(dir)));
}

/**
 * Generate emergency checklist from template
 * @param {string} outputDir - Output directory path
 * @throws {Error} - If template file not found or generation fails
 */
async function generateEmergencyChecklist(outputDir) {
    try {
        const templatePath = path.join(__dirname, 'templates', 'emergency-checklist.template.md');
        const template = fs.readFileSync(templatePath, 'utf8');
        
        const variables = {
            RTO_TABLE: generateRTOTable()
        };
        
        const content = processTemplate(template, variables);
        
        writeTemplate(
            path.join(outputDir, 'emergency-checklist.md'), 
            content, 
            'Emergency Response Checklist'
        );
    } catch (error) {
        console.error('Error generating emergency checklist:', error.message);
        throw error;
    }
}

/**
 * Generate incident report template
 */
async function generateIncidentReportTemplate(templatesDir) {
    const content = `# Incident Report Template

## Incident Information

**Incident ID:** [Auto-generated or manual ID]
**Date/Time:** [YYYY-MM-DD HH:MM:SS UTC]
**Reporter:** [Name and contact]
**Severity:** [Critical/High/Medium/Low]

## Summary

**Brief Description:**
[One-line summary of what happened]

**Impact:**
[Description of business impact, affected systems, duration]

## Timeline

| Time (UTC) | Event | Action Taken |
|------------|-------|--------------|
| [HH:MM] | [Event description] | [Action description] |
| [HH:MM] | [Event description] | [Action description] |

## Root Cause Analysis

**Primary Cause:**
[Detailed description of the root cause]

**Contributing Factors:**
- [Factor 1]
- [Factor 2]

**Evidence:**
[Logs, screenshots, error messages that support the analysis]

## Recovery Actions

**Recovery Scenario Used:** [Scenario name]
**Recovery Start Time:** [HH:MM UTC]
**Recovery End Time:** [HH:MM UTC]
**Total Recovery Time:** [X minutes]

**Steps Taken:**
1. [Step 1 description]
2. [Step 2 description]
3. [Step 3 description]

**Validation Results:**
- [ ] All services restored
- [ ] Data integrity verified
- [ ] Performance within normal parameters
- [ ] Trading functionality confirmed

## Impact Assessment

**Systems Affected:**
- [System 1]: [Impact description]
- [System 2]: [Impact description]

**Business Impact:**
- Trading downtime: [X minutes]
- Financial impact: [Amount if applicable]
- Customer impact: [Description]

**Data Impact:**
- Data loss: [Yes/No - details]
- Data corruption: [Yes/No - details]
- Backup usage: [Yes/No - which backups]

## Lessons Learned

**What Went Well:**
- [Positive aspect 1]
- [Positive aspect 2]

**What Could Be Improved:**
- [Improvement area 1]
- [Improvement area 2]

**Action Items:**
| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| [Action 1] | [Name] | [Date] | [Status] |
| [Action 2] | [Name] | [Date] | [Status] |

## Prevention Measures

**Immediate Actions:**
- [Action to prevent immediate recurrence]

**Long-term Actions:**
- [Systemic improvements]
- [Process changes]
- [Technology upgrades]

## Attachments

- [ ] Recovery logs
- [ ] System monitoring screenshots
- [ ] Error logs
- [ ] Configuration files (before/after)

---

**Report Prepared By:** [Name]
**Date:** [YYYY-MM-DD]
**Reviewed By:** [Name]
**Approved By:** [Name]
`;

    writeTemplate(
        path.join(templatesDir, 'incident-report-template.md'), 
        content, 
        'Incident Report Template'
    );
}

/**
 * Generate recovery log template
 */
async function generateRecoveryLogTemplate(templatesDir) {
    const content = `# Recovery Log Template

**Recovery ID:** [recovery-YYYYMMDD-HHMMSS-PID]
**Scenario:** [Scenario name]
**Start Time:** [YYYY-MM-DDTHH:MM:SSZ]
**Operator:** [Name]

## Pre-Recovery Status

**System Status:**
- PM2 Processes: [Status]
- Redis: [Status]
- Network: [Status]
- Disk Space: [Available space]

**Failure Symptoms:**
- [Symptom 1]
- [Symptom 2]

## Recovery Steps

### Step 1: [Step Name]
**Time:** [HH:MM:SS]
**Command:** \`[command executed]\`
**Result:** [Success/Failure]
**Duration:** [X seconds]
**Notes:** [Any observations]

### Step 2: [Step Name]
**Time:** [HH:MM:SS]
**Command:** \`[command executed]\`
**Result:** [Success/Failure]
**Duration:** [X seconds]
**Notes:** [Any observations]

[Continue for all steps...]

## Validation Results

### System Health Checks
- [ ] PM2 processes online
- [ ] Redis connectivity
- [ ] WebSocket connections
- [ ] Trading system health

### Performance Validation
- [ ] CPU usage normal
- [ ] Memory usage normal
- [ ] Disk I/O normal
- [ ] Network latency acceptable

### Trading Validation
- [ ] Position reconciliation
- [ ] Account balances correct
- [ ] Order placement functional
- [ ] Risk management active

## Recovery Summary

**End Time:** [YYYY-MM-DDTHH:MM:SSZ]
**Total Duration:** [X minutes Y seconds]
**Success:** [Yes/No]
**Issues Encountered:** [Description of any issues]

## Post-Recovery Monitoring

**30-Minute Check:**
- System performance: [Normal/Abnormal]
- Error logs: [Clean/Issues found]
- Trading activity: [Normal/Abnormal]

**1-Hour Check:**
- System stability: [Stable/Unstable]
- Performance metrics: [Within/Outside normal range]
- Any alerts triggered: [Yes/No - details]

## Notes and Observations

[Any additional notes, observations, or recommendations for future recoveries]

---

**Log Completed By:** [Name]
**Date:** [YYYY-MM-DD HH:MM UTC]
`;

    writeTemplate(
        path.join(templatesDir, 'recovery-log-template.md'), 
        content, 
        'Recovery Log Template'
    );
}

/**
 * Generate post-incident review template
 */
async function generatePostIncidentReviewTemplate(templatesDir) {
    const content = `# Post-Incident Review Template

## Meeting Information

**Date:** [YYYY-MM-DD]
**Time:** [HH:MM UTC]
**Facilitator:** [Name]
**Attendees:** [List of attendees]

## Incident Overview

**Incident ID:** [ID]
**Date/Time:** [YYYY-MM-DD HH:MM UTC]
**Duration:** [X hours Y minutes]
**Severity:** [Critical/High/Medium/Low]
**Recovery Scenario:** [Scenario used]

## Timeline Review

[Review the incident timeline, focusing on key decision points and actions]

## What Went Well

### Detection
- [How quickly was the incident detected?]
- [Were monitoring systems effective?]

### Response
- [Was the response appropriate and timely?]
- [Did the team follow procedures correctly?]

### Recovery
- [Did the recovery procedures work as expected?]
- [Were recovery time objectives met?]

### Communication
- [Was communication effective during the incident?]
- [Were stakeholders properly informed?]

## Areas for Improvement

### Detection
- [Could the incident have been detected sooner?]
- [Are there gaps in monitoring?]

### Response
- [Were there delays in response?]
- [Did procedures need clarification?]

### Recovery
- [Did recovery take longer than expected?]
- [Were there issues with recovery procedures?]

### Communication
- [Could communication have been better?]
- [Were the right people notified?]

## Root Cause Analysis

**Primary Root Cause:**
[Detailed analysis of the fundamental cause]

**Contributing Factors:**
1. [Factor 1 with explanation]
2. [Factor 2 with explanation]

**Why did this happen?**
[5 Whys analysis or similar root cause technique]

## Action Items

| Priority | Action | Owner | Due Date | Success Criteria |
|----------|--------|-------|----------|------------------|
| High | [Action 1] | [Name] | [Date] | [How to measure success] |
| Medium | [Action 2] | [Name] | [Date] | [How to measure success] |
| Low | [Action 3] | [Name] | [Date] | [How to measure success] |

## Process Improvements

### Documentation Updates
- [ ] Update disaster recovery procedures
- [ ] Update monitoring runbooks
- [ ] Update escalation procedures

### Technical Improvements
- [ ] Infrastructure changes
- [ ] Monitoring enhancements
- [ ] Automation improvements

### Training Needs
- [ ] Team training requirements
- [ ] Procedure walkthroughs
- [ ] Simulation exercises

## Prevention Measures

**Short-term (1-4 weeks):**
- [Immediate actions to prevent recurrence]

**Medium-term (1-3 months):**
- [Process and system improvements]

**Long-term (3+ months):**
- [Strategic improvements and investments]

## Metrics and KPIs

**Recovery Metrics:**
- Detection time: [X minutes]
- Response time: [X minutes]
- Recovery time: [X minutes]
- Total downtime: [X minutes]

**Comparison to Objectives:**
- RTO target: [X minutes] | Actual: [Y minutes]
- RPO target: [X minutes] | Actual: [Y minutes]

## Follow-up Actions

**Next Review Date:** [Date]
**Action Item Review:** [Weekly/Bi-weekly schedule]
**Procedure Testing:** [Schedule for testing updated procedures]

## Lessons Learned Summary

**Key Takeaways:**
1. [Lesson 1]
2. [Lesson 2]
3. [Lesson 3]

**Knowledge Sharing:**
- [ ] Share lessons with broader team
- [ ] Update training materials
- [ ] Document in knowledge base

---

**Review Completed By:** [Facilitator Name]
**Date:** [YYYY-MM-DD]
**Next Review:** [Date if applicable]
`;

    writeTemplate(
        path.join(templatesDir, 'post-incident-review-template.md'), 
        content, 
        'Post-Incident Review Template'
    );
}

// Execute main function
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = {
    generateAdditionalScripts,
    generateEmergencyChecklist,
    generateIncidentReportTemplate,
    generateRecoveryLogTemplate,
    generatePostIncidentReviewTemplate
};