#!/usr/bin/env node

/**
 * Disaster Recovery Integration Script
 * 
 * Integrates disaster recovery automation and testing systems.
 * Provides a unified interface for disaster recovery operations.
 * 
 * Requirements: 10.3, 10.4, 10.5
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Configuration
const PROJECT_ROOT = path.dirname(__dirname);
const DR_CONFIG_PATH = path.join(PROJECT_ROOT, 'config/disaster-recovery.config.json');
const DR_TEST_CONFIG_PATH = path.join(PROJECT_ROOT, 'config/disaster-recovery-testing.config.json');

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

/**
 * Print colored output
 */
function colorLog(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Show usage information
 */
function showUsage() {
  console.log(`
Disaster Recovery Integration

Usage: node ${path.basename(__filename)} <command> [options]

Commands:
  status                      Show disaster recovery system status
  trigger-recovery [components...]  Trigger disaster recovery
  run-test [scenarios...]     Run disaster recovery tests
  validate-system             Validate complete system integrity
  setup                       Setup disaster recovery system
  help                        Show this help message

Options:
  --dry-run                   Show what would be done without executing
  --force                     Skip confirmation prompts
  --environment <env>         Specify environment

Examples:
  node ${path.basename(__filename)} status
  node ${path.basename(__filename)} trigger-recovery redis titan-brain
  node ${path.basename(__filename)} run-test --dry-run
  node ${path.basename(__filename)} validate-system

`);
}

/**
 * Load configuration
 */
function loadConfig(configPath) {
  try {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }
    
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    colorLog('red', `Error loading configuration: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Execute command with output
 */
function executeCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Show disaster recovery system status
 */
async function showStatus() {
  colorLog('blue', '🔍 Disaster Recovery System Status');
  
  try {
    // Load configurations
    const drConfig = loadConfig(DR_CONFIG_PATH);
    const testConfig = loadConfig(DR_TEST_CONFIG_PATH);
    
    console.log('\n📋 Configuration Status:');
    console.log(`  Disaster Recovery: ${drConfig.enabled ? colors.green + 'Enabled' + colors.reset : colors.red + 'Disabled' + colors.reset}`);
    console.log(`  Testing: ${testConfig.enabled ? colors.green + 'Enabled' + colors.reset : colors.red + 'Disabled' + colors.reset}`);
    console.log(`  Max Recovery Time: ${drConfig.maxRecoveryTime} seconds`);
    console.log(`  Test Schedule: ${testConfig.schedule}`);
    
    console.log('\n🔧 Components:');
    drConfig.components.forEach(component => {
      console.log(`  - ${component.name} (${component.type}, priority: ${component.priority})`);
    });
    
    console.log('\n🧪 Test Scenarios:');
    testConfig.testScenarios.forEach(scenario => {
      console.log(`  - ${scenario.id} (${scenario.severity})`);
    });
    
    console.log('\n📢 Notifications:');
    const enabledChannels = drConfig.notifications.channels.filter(c => c.enabled);
    console.log(`  Channels: ${enabledChannels.map(c => c.type).join(', ')}`);
    
    // Check if disaster recovery manager is available
    const drManagerPath = path.join(PROJECT_ROOT, 'scripts/disaster-recovery-manager.js');
    const drTestPath = path.join(PROJECT_ROOT, 'scripts/disaster-recovery-test.sh');
    
    console.log('\n🛠️  Tools Status:');
    console.log(`  DR Manager: ${fs.existsSync(drManagerPath) ? colors.green + 'Available' + colors.reset : colors.red + 'Missing' + colors.reset}`);
    console.log(`  DR Testing: ${fs.existsSync(drTestPath) ? colors.green + 'Available' + colors.reset : colors.red + 'Missing' + colors.reset}`);
    
  } catch (error) {
    colorLog('red', `Error showing status: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Trigger disaster recovery
 */
async function triggerRecovery(components, options = {}) {
  colorLog('blue', '🚨 Triggering Disaster Recovery');
  
  if (!options.force && !options.dryRun) {
    colorLog('yellow', 'This will trigger disaster recovery procedures.');
    colorLog('yellow', 'Use --force to skip this confirmation or --dry-run to simulate.');
    process.exit(1);
  }
  
  try {
    const drManagerPath = path.join(PROJECT_ROOT, 'scripts/disaster-recovery-manager.js');
    
    if (!fs.existsSync(drManagerPath)) {
      throw new Error('Disaster recovery manager not found');
    }
    
    const args = ['trigger'];
    
    if (options.force) {
      args.push('--force');
    }
    
    if (options.dryRun) {
      args.push('--dry-run');
    }
    
    if (components.length > 0) {
      args.push('--components', components.join(','));
    }
    
    await executeCommand('node', [drManagerPath, ...args]);
    
    colorLog('green', '✅ Disaster recovery completed');
    
  } catch (error) {
    colorLog('red', `Disaster recovery failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Run disaster recovery tests
 */
async function runTests(scenarios, options = {}) {
  colorLog('blue', '🧪 Running Disaster Recovery Tests');
  
  try {
    const drTestPath = path.join(PROJECT_ROOT, 'scripts/disaster-recovery-test.sh');
    
    if (!fs.existsSync(drTestPath)) {
      throw new Error('Disaster recovery test script not found');
    }
    
    const args = ['run'];
    
    if (options.dryRun) {
      args.push('--dry-run');
    }
    
    if (options.environment) {
      args.push('--environment', options.environment);
    }
    
    if (scenarios.length > 0) {
      args.push(...scenarios);
    }
    
    await executeCommand('bash', [drTestPath, ...args]);
    
    colorLog('green', '✅ Disaster recovery tests completed');
    
  } catch (error) {
    colorLog('red', `Disaster recovery tests failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Validate complete system integrity
 */
async function validateSystem() {
  colorLog('blue', '🔍 Validating System Integrity');
  
  try {
    const drManagerPath = path.join(PROJECT_ROOT, 'scripts/disaster-recovery-manager.js');
    
    if (!fs.existsSync(drManagerPath)) {
      throw new Error('Disaster recovery manager not found');
    }
    
    await executeCommand('node', [drManagerPath, 'validate']);
    
    colorLog('green', '✅ System validation completed');
    
  } catch (error) {
    colorLog('red', `System validation failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Setup disaster recovery system
 */
async function setupSystem() {
  colorLog('blue', '⚙️  Setting up Disaster Recovery System');
  
  try {
    // Check if configurations exist
    if (!fs.existsSync(DR_CONFIG_PATH)) {
      colorLog('red', 'Disaster recovery configuration not found');
      colorLog('yellow', 'Please create config/disaster-recovery.config.json');
      process.exit(1);
    }
    
    if (!fs.existsSync(DR_TEST_CONFIG_PATH)) {
      colorLog('red', 'Disaster recovery testing configuration not found');
      colorLog('yellow', 'Please create config/disaster-recovery-testing.config.json');
      process.exit(1);
    }
    
    // Validate configurations
    const drConfig = loadConfig(DR_CONFIG_PATH);
    const testConfig = loadConfig(DR_TEST_CONFIG_PATH);
    
    colorLog('green', '✓ Configuration files found and valid');
    
    // Create necessary directories
    const directories = [
      'logs/disaster-recovery',
      'logs/disaster-recovery-testing',
      'reports/disaster-recovery',
      'backups/disaster-recovery'
    ];
    
    for (const dir of directories) {
      const fullPath = path.join(PROJECT_ROOT, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        colorLog('green', `✓ Created directory: ${dir}`);
      }
    }
    
    // Check dependencies
    const dependencies = ['node', 'redis-cli', 'pm2'];
    for (const dep of dependencies) {
      try {
        await executeCommand('which', [dep], { stdio: 'ignore' });
        colorLog('green', `✓ ${dep} is available`);
      } catch (error) {
        colorLog('yellow', `⚠ ${dep} is not available - some features may not work`);
      }
    }
    
    colorLog('green', '✅ Disaster recovery system setup completed');
    
    // Show next steps
    console.log('\n📋 Next Steps:');
    console.log('  1. Review and customize configuration files');
    console.log('  2. Test disaster recovery with: node scripts/disaster-recovery-integration.js run-test --dry-run');
    console.log('  3. Validate system with: node scripts/disaster-recovery-integration.js validate-system');
    console.log('  4. Enable scheduled testing if desired');
    
  } catch (error) {
    colorLog('red', `Setup failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Parse command line arguments
 */
function parseArguments() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    showUsage();
    process.exit(1);
  }
  
  const command = args[0];
  const options = {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    environment: null
  };
  
  // Parse environment
  const envIndex = args.indexOf('--environment');
  if (envIndex !== -1 && args[envIndex + 1]) {
    options.environment = args[envIndex + 1];
  }
  
  // Parse positional arguments
  const positionalArgs = args.filter(arg => 
    !arg.startsWith('--') && 
    arg !== command &&
    args.indexOf(arg) !== envIndex + 1
  );
  
  return { command, options, positionalArgs };
}

/**
 * Main execution function
 */
async function main() {
  try {
    const { command, options, positionalArgs } = parseArguments();
    
    switch (command) {
      case 'status':
        await showStatus();
        break;
      
      case 'trigger-recovery':
        await triggerRecovery(positionalArgs, options);
        break;
      
      case 'run-test':
        await runTests(positionalArgs, options);
        break;
      
      case 'validate-system':
        await validateSystem();
        break;
      
      case 'setup':
        await setupSystem();
        break;
      
      case 'help':
        showUsage();
        break;
      
      default:
        colorLog('red', `Unknown command: ${command}`);
        showUsage();
        process.exit(1);
    }
    
  } catch (error) {
    colorLog('red', `Error: ${error.message}`);
    process.exit(1);
  }
}

// Execute main function
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main };