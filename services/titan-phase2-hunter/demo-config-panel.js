#!/usr/bin/env node

/**
 * Demo script for ConfigPanel functionality
 * Shows how the F1 key opens the configuration panel
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🎯 Titan Phase 2 Hunter - ConfigPanel Demo');
console.log('==========================================');
console.log('');
console.log('This demo shows the ConfigPanel component functionality:');
console.log('');
console.log('✅ Modal overlay configuration panel (F1 key)');
console.log('✅ Alignment weight sliders (Daily 30-60%, 4H 20-40%, 15m 10-30%)');
console.log('✅ RS threshold slider (0-5%)');
console.log('✅ Risk settings (max leverage 3-5x, stop 1-3%, target 3-6%)');
console.log('✅ Portfolio settings (max positions 3-8, max heat 10-20%, correlation 0.6-0.9)');
console.log('✅ Save/cancel buttons with immediate application');
console.log('✅ Real-time validation with error messages');
console.log('✅ Keyboard navigation ([1-4] sections, [↑↓] navigate, [←→] adjust)');
console.log('');
console.log('📋 Configuration Features:');
console.log('  • Alignment weights must sum to 100%');
console.log('  • Auto-adjust function for weight normalization');
console.log('  • R:R ratio calculation and validation (minimum 2:1)');
console.log('  • Parameter range validation for all settings');
console.log('  • Hot-reload configuration without restart');
console.log('  • Configuration file watching and automatic reload');
console.log('');
console.log('🎮 Controls:');
console.log('  [F1] - Open Configuration Panel');
console.log('  [1-4] - Switch between sections (Alignment, RS, Risk, Portfolio)');
console.log('  [↑↓] - Navigate between parameters in current section');
console.log('  [←→] - Adjust parameter values');
console.log('  [S] - Save configuration');
console.log('  [C] - Cancel and return to dashboard');
console.log('  [Q] - Quit application');
console.log('');
console.log('📊 Current Configuration:');

// Show current configuration
const { ConfigManager } = require('./dist/config/ConfigManager');
const configManager = new ConfigManager();
const config = configManager.getConfig();

console.log(`  📊 Alignment: Daily ${config.alignmentWeights.daily}%, 4H ${config.alignmentWeights.h4}%, 15m ${config.alignmentWeights.m15}%`);
console.log(`  📈 RS: Threshold ${config.rsConfig.threshold}%, Lookback ${config.rsConfig.lookbackPeriod}h`);
console.log(`  ⚡ Risk: Leverage ${config.riskConfig.maxLeverage}x, Stop ${config.riskConfig.stopLossPercent}%, Target ${config.riskConfig.targetPercent}%`);
console.log(`  💼 Portfolio: Max ${config.portfolioConfig.maxConcurrentPositions} positions, Heat ${config.portfolioConfig.maxPortfolioHeat}%, Correlation ${config.portfolioConfig.correlationThreshold}`);

const rrRatio = config.riskConfig.targetPercent / config.riskConfig.stopLossPercent;
console.log(`  📈 Risk-Reward Ratio: ${rrRatio.toFixed(1)}:1`);

console.log('');
console.log('🚀 Starting Hunter Application...');
console.log('   Press F1 to open the Configuration Panel');
console.log('   Press Q to quit');
console.log('');

// Start the application
const child = spawn('npm', ['run', 'dev'], {
  cwd: __dirname,
  stdio: 'inherit'
});

child.on('close', (code) => {
  console.log(`\n👋 Hunter Application exited with code ${code}`);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping demo...');
  child.kill('SIGINT');
  process.exit(0);
});