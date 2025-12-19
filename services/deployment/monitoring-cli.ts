#!/usr/bin/env node

/**
 * Monitoring System CLI for Titan Trading System
 * 
 * Command-line interface for managing the production monitoring system.
 */

import { getMonitoringOrchestrator } from './MonitoringOrchestrator';

// Simple color logging utility
const colors = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  gray: (text: string) => `\x1b[90m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`,
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const orchestrator = getMonitoringOrchestrator({
    monitoring: {
      interval: 30000, // 30 seconds as required
      dataRetentionDays: 30
    },
    alerting: {
      enabled: true,
      channels: {
        console: { enabled: true, colors: true },
        email: { enabled: false },
        slack: { enabled: false },
        webhook: { enabled: false }
      }
    },
    retention: {
      policy: {
        retentionDays: 30,
        compressionEnabled: true,
        compressionAfterDays: 7
      }
    }
  });
  
  try {
    switch (command) {
      case 'start':
        console.log(colors.blue('🚀 Starting Titan monitoring system...'));
        await orchestrator.startMonitoring();
        
        // Keep running and show periodic status
        setInterval(async () => {
          const metrics = orchestrator.getCurrentMetrics();
          const health = orchestrator.getHealthSummary();
          
          console.log(colors.cyan('\n📊 Current Status:'));
          if (metrics.system) {
            console.log(colors.gray(`   CPU: ${metrics.system.cpu.usage.toFixed(1)}%`));
            console.log(colors.gray(`   Memory: ${metrics.system.memory.usage.toFixed(1)}%`));
            console.log(colors.gray(`   Disk: ${metrics.system.disk.usage.toFixed(1)}%`));
          }
          
          if (metrics.trading) {
            console.log(colors.gray(`   Equity: $${metrics.trading.equity.total.toFixed(2)}`));
            console.log(colors.gray(`   Drawdown: ${metrics.trading.drawdown.current.toFixed(1)}%`));
            console.log(colors.gray(`   Daily P&L: $${metrics.trading.performance.dailyPnL.toFixed(2)}`));
          }
          
          console.log(colors.gray(`   Active Alerts: ${metrics.alerts.length}`));
          console.log(colors.gray(`   Health: ${health.status}`));
          
        }, 60000); // Show status every minute
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
          console.log(colors.yellow('\n🛑 Shutting down monitoring system...'));
          orchestrator.shutdown();
          process.exit(0);
        });
        
        break;
        
      case 'status':
        const status = await orchestrator.getSystemStatus();
        const health = orchestrator.getHealthSummary();
        
        console.log(colors.blue('📊 Monitoring System Status:'));
        console.log(colors.gray(`   Overall Health: ${health.status}`));
        console.log(colors.gray(`   Monitoring Active: ${status.monitoring.active}`));
        console.log(colors.gray(`   Data Points: ${status.monitoring.dataPoints}`));
        console.log(colors.gray(`   Active Alerts: ${status.alerting.activeAlerts}`));
        console.log(colors.gray(`   Alert Channels: ${status.alerting.enabledChannels.join(', ')}`));
        console.log(colors.gray(`   Retention Days: ${status.retention.retentionDays}`));
        console.log(colors.gray(`   Storage Files: ${status.retention.totalFiles}`));
        
        if (health.issues.length > 0) {
          console.log(colors.red('\n⚠️ Issues:'));
          health.issues.forEach(issue => console.log(colors.red(`   - ${issue}`)));
        }
        
        if (health.recommendations.length > 0) {
          console.log(colors.yellow('\n💡 Recommendations:'));
          health.recommendations.forEach(rec => console.log(colors.yellow(`   - ${rec}`)));
        }
        
        break;
        
      case 'test-alerts':
        console.log(colors.blue('🧪 Testing alert channels...'));
        const results = await orchestrator.testAlertChannels();
        
        console.log(colors.green('\n✅ Alert Channel Test Results:'));
        Object.entries(results).forEach(([channel, success]) => {
          const status = success ? colors.green('✅ PASS') : colors.red('❌ FAIL');
          console.log(`   ${channel}: ${status}`);
        });
        
        break;
        
      case 'trigger-alert':
        const severity = (args[1] as any) || 'info';
        console.log(colors.blue(`🚨 Triggering test ${severity} alert...`));
        
        await orchestrator.triggerTestAlert(
          'CLI Test Alert',
          `This is a test ${severity} alert triggered from the CLI`,
          severity
        );
        
        break;
        
      case 'maintenance':
        console.log(colors.blue('🔧 Running maintenance tasks...'));
        const maintenanceResults = await orchestrator.performMaintenance();
        
        console.log(colors.green('\n✅ Maintenance Results:'));
        console.log(colors.gray(`   Files Compressed: ${maintenanceResults.compressedFiles}`));
        console.log(colors.gray(`   Files Deleted: ${maintenanceResults.deletedFiles}`));
        console.log(colors.gray(`   Total Storage: ${formatBytes(maintenanceResults.storageStats.totalSize)}`));
        
        break;
        
      case 'export':
        const days = parseInt(args[1]) || 7;
        const outputPath = args[2] || `./metrics-export-${Date.now()}.json`;
        
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        console.log(colors.blue(`📤 Exporting ${days} days of metrics to ${outputPath}...`));
        await orchestrator.exportMetrics(startDate, endDate, outputPath);
        
        break;
        
      default:
        console.log(colors.blue('🎛️ Titan Monitoring System CLI'));
        console.log(colors.gray('\nUsage:'));
        console.log(colors.gray('  npm run monitoring start           - Start monitoring system'));
        console.log(colors.gray('  npm run monitoring status          - Show system status'));
        console.log(colors.gray('  npm run monitoring test-alerts     - Test alert channels'));
        console.log(colors.gray('  npm run monitoring trigger-alert [severity] - Trigger test alert'));
        console.log(colors.gray('  npm run monitoring maintenance     - Run maintenance tasks'));
        console.log(colors.gray('  npm run monitoring export [days] [path] - Export metrics'));
        console.log(colors.gray('\nExamples:'));
        console.log(colors.gray('  npm run monitoring trigger-alert critical'));
        console.log(colors.gray('  npm run monitoring export 30 ./monthly-metrics.json'));
        break;
    }
    
  } catch (error) {
    console.error(colors.red('❌ Error:'), error.message);
    process.exit(1);
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Run CLI if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(colors.red('❌ Fatal error:'), error);
    process.exit(1);
  });
}