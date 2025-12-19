/**
 * Monitoring and Alerting Orchestrator for Titan Trading System
 * 
 * Integrates MonitoringService, AlertingService, and MetricsRetentionService
 * to provide comprehensive production monitoring with alerting and data retention.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5 - Complete monitoring system
 */

import { EventEmitter } from 'eventemitter3';
import { getMonitoringService, type MonitoringService, type MonitoringConfig } from './MonitoringService';
import { getAlertingService, type AlertingService, type AlertingConfig } from './AlertingService';
import { getMetricsRetentionService, type MetricsRetentionService, type MetricsRetentionConfig } from './MetricsRetentionService';
import { getTelemetryService } from '../shared/src/TelemetryService';

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

/**
 * Complete monitoring system configuration
 */
export interface MonitoringSystemConfig {
  monitoring: Partial<MonitoringConfig>;
  alerting: Partial<AlertingConfig>;
  retention: Partial<MetricsRetentionConfig>;
}

/**
 * Monitoring system status
 */
export interface MonitoringSystemStatus {
  monitoring: {
    active: boolean;
    dataPoints: number;
    lastUpdate: number;
  };
  alerting: {
    enabled: boolean;
    activeAlerts: number;
    enabledChannels: string[];
  };
  retention: {
    running: boolean;
    retentionDays: number;
    totalFiles: number;
    totalSize: number;
  };
}

/**
 * Monitoring and Alerting Orchestrator
 */
export class MonitoringOrchestrator extends EventEmitter {
  private monitoringService: MonitoringService;
  private alertingService: AlertingService;
  private retentionService: MetricsRetentionService;
  private telemetry = getTelemetryService();
  private isRunning = false;
  
  constructor(config: MonitoringSystemConfig = {}) {
    super();
    
    // Initialize services
    this.monitoringService = getMonitoringService(config.monitoring);
    this.alertingService = getAlertingService(config.alerting);
    this.retentionService = getMetricsRetentionService(config.retention);
    
    // Set up event handlers
    this.setupEventHandlers();
    
    console.log(colors.blue('🎛️ Monitoring Orchestrator initialized'));
  }
  
  /**
   * Start the complete monitoring system
   */
  async startMonitoring(): Promise<void> {
    if (this.isRunning) {
      console.log(colors.yellow('⚠️ Monitoring system already running'));
      return;
    }
    
    try {
      console.log(colors.blue('🚀 Starting complete monitoring system...'));
      
      // Start retention service first
      await this.retentionService.start();
      
      // Start monitoring service
      await this.monitoringService.startMonitoring();
      
      // Alerting service is passive, no need to start explicitly
      
      this.isRunning = true;
      
      console.log(colors.green('✅ Complete monitoring system started successfully'));
      console.log(colors.gray('   - System metrics monitoring: 30s intervals'));
      console.log(colors.gray('   - Trading metrics monitoring: real-time'));
      console.log(colors.gray('   - Multi-channel alerting: enabled'));
      console.log(colors.gray('   - Data retention: 30 days with compression'));
      
      // Emit system started event
      this.emit('systemStarted', {
        timestamp: Date.now(),
        services: ['monitoring', 'alerting', 'retention']
      });
      
      // Log system startup
      this.telemetry.logInfo('MonitoringOrchestrator', 'Complete monitoring system started', {
        services: ['monitoring', 'alerting', 'retention']
      });
      
    } catch (error) {
      console.error(colors.red('❌ Failed to start monitoring system:'), error);
      this.telemetry.logError('MonitoringOrchestrator', 'Failed to start monitoring system', {
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Stop the complete monitoring system
   */
  stopMonitoring(): void {
    if (!this.isRunning) {
      console.log(colors.yellow('⚠️ Monitoring system not running'));
      return;
    }
    
    console.log(colors.blue('🛑 Stopping complete monitoring system...'));
    
    // Stop services
    this.monitoringService.stopMonitoring();
    this.retentionService.stop();
    
    this.isRunning = false;
    
    console.log(colors.yellow('✅ Complete monitoring system stopped'));
    
    // Emit system stopped event
    this.emit('systemStopped', {
      timestamp: Date.now()
    });
    
    // Log system shutdown
    this.telemetry.logInfo('MonitoringOrchestrator', 'Complete monitoring system stopped');
  }
  /**
   * Set up event handlers between services
   */
  private setupEventHandlers(): void {
    // Monitor metrics collection and process for alerts
    this.monitoringService.on('metricsCollected', async (data) => {
      try {
        // Store metrics for retention
        await this.retentionService.storeMetrics(data);
        
        // Process for alerts
        await this.alertingService.processMonitoringData(data);
        
        // Forward event
        this.emit('metricsProcessed', {
          timestamp: Date.now(),
          dataPoint: data
        });
        
      } catch (error) {
        console.error(colors.red('❌ Failed to process metrics:'), error);
        this.telemetry.logError('MonitoringOrchestrator', 'Failed to process metrics', {
          error: error.message
        });
      }
    });
    
    // Forward alert events
    this.alertingService.on('alert', (alert) => {
      console.log(colors.red(`🚨 ALERT: ${alert.title} - ${alert.message}`));
      this.emit('alert', alert);
      
      // Log critical alerts
      if (alert.severity === 'critical' || alert.severity === 'emergency') {
        this.telemetry.logError('MonitoringOrchestrator', `${alert.severity.toUpperCase()} ALERT: ${alert.title}`, {
          alertId: alert.id,
          message: alert.message,
          category: alert.category
        });
      }
    });
    
    // Forward retention events
    this.retentionService.on('fileCompressed', (event) => {
      console.log(colors.cyan(`🗜️ Compressed: ${event.originalFile} (${event.compressionRatio}% of original)`));
      this.emit('fileCompressed', event);
    });
    
    this.retentionService.on('fileDeleted', (event) => {
      console.log(colors.gray(`🗑️ Deleted: ${event.file} (${this.formatBytes(event.size)})`));
      this.emit('fileDeleted', event);
    });
    
    // Handle monitoring service errors
    this.monitoringService.on('error', (error) => {
      console.error(colors.red('❌ Monitoring service error:'), error);
      this.emit('monitoringError', error);
    });
    
    // Handle alerting service errors
    this.alertingService.on('error', (error) => {
      console.error(colors.red('❌ Alerting service error:'), error);
      this.emit('alertingError', error);
    });
    
    // Handle retention service errors
    this.retentionService.on('error', (error) => {
      console.error(colors.red('❌ Retention service error:'), error);
      this.emit('retentionError', error);
    });
  }
  
  /**
   * Get comprehensive system status
   */
  async getSystemStatus(): Promise<MonitoringSystemStatus> {
    try {
      const monitoringStats = this.monitoringService.getMonitoringStats();
      const alertingStats = this.alertingService.getAlertingStats();
      const retentionStatus = this.retentionService.getStatus();
      const storageStats = await this.retentionService.getStorageStats();
      
      return {
        monitoring: {
          active: monitoringStats.isActive,
          dataPoints: monitoringStats.dataPoints,
          lastUpdate: monitoringStats.lastUpdate
        },
        alerting: {
          enabled: alertingStats.enabledChannels.length > 0,
          activeAlerts: alertingStats.activeAlerts,
          enabledChannels: alertingStats.enabledChannels
        },
        retention: {
          running: retentionStatus.isRunning,
          retentionDays: retentionStatus.retentionDays,
          totalFiles: storageStats.totalFiles,
          totalSize: storageStats.totalSize
        }
      };
      
    } catch (error) {
      console.error(colors.red('❌ Failed to get system status:'), error);
      throw error;
    }
  }
  
  /**
   * Get current metrics dashboard
   */
  getCurrentMetrics() {
    const systemMetrics = this.monitoringService.getCurrentSystemMetrics();
    const tradingMetrics = this.monitoringService.getCurrentTradingMetrics();
    const activeAlerts = this.alertingService.getActiveAlerts();
    
    return {
      system: systemMetrics,
      trading: tradingMetrics,
      alerts: activeAlerts,
      timestamp: Date.now()
    };
  }
  
  /**
   * Test all alert channels
   */
  async testAlertChannels(): Promise<{ [channel: string]: boolean }> {
    console.log(colors.blue('🧪 Testing alert channels...'));
    
    try {
      const results = await this.alertingService.testAlertChannels();
      
      console.log(colors.green('✅ Alert channel test completed'));
      return results;
      
    } catch (error) {
      console.error(colors.red('❌ Failed to test alert channels:'), error);
      throw error;
    }
  }
  
  /**
   * Manually trigger alert for testing
   */
  async triggerTestAlert(
    title: string = 'Test Alert',
    message: string = 'This is a test alert from the monitoring system',
    severity: 'info' | 'warning' | 'critical' | 'emergency' = 'info'
  ): Promise<void> {
    console.log(colors.blue(`🧪 Triggering test alert: ${title}`));
    
    try {
      await this.alertingService.createManualAlert(
        title,
        message,
        severity,
        'system',
        ['console', 'email', 'slack', 'webhook']
      );
      
      console.log(colors.green('✅ Test alert triggered successfully'));
      
    } catch (error) {
      console.error(colors.red('❌ Failed to trigger test alert:'), error);
      throw error;
    }
  }
  
  /**
   * Export metrics for analysis
   */
  async exportMetrics(
    startDate: Date,
    endDate: Date,
    outputPath: string
  ): Promise<void> {
    console.log(colors.blue(`📤 Exporting metrics from ${startDate.toISOString()} to ${endDate.toISOString()}`));
    
    try {
      await this.retentionService.exportMetrics(startDate, endDate, outputPath);
      console.log(colors.green(`✅ Metrics exported to ${outputPath}`));
      
    } catch (error) {
      console.error(colors.red('❌ Failed to export metrics:'), error);
      throw error;
    }
  }
  
  /**
   * Perform maintenance tasks
   */
  async performMaintenance(): Promise<{
    compressedFiles: number;
    deletedFiles: number;
    storageStats: any;
  }> {
    console.log(colors.blue('🔧 Performing maintenance tasks...'));
    
    try {
      // Compress old files
      const compressedFiles = await this.retentionService.compressOldFiles();
      
      // Clean up old files
      const deletedFiles = await this.retentionService.cleanupOldFiles();
      
      // Enforce storage limits
      await this.retentionService.enforceStorageLimits();
      
      // Get updated storage stats
      const storageStats = await this.retentionService.getStorageStats();
      
      console.log(colors.green('✅ Maintenance completed'));
      console.log(colors.gray(`   Compressed: ${compressedFiles} files`));
      console.log(colors.gray(`   Deleted: ${deletedFiles} files`));
      console.log(colors.gray(`   Storage: ${this.formatBytes(storageStats.totalSize)} (${storageStats.totalFiles} files)`));
      
      return {
        compressedFiles,
        deletedFiles,
        storageStats
      };
      
    } catch (error) {
      console.error(colors.red('❌ Maintenance failed:'), error);
      throw error;
    }
  }
  
  /**
   * Update system configuration
   */
  updateConfiguration(config: Partial<MonitoringSystemConfig>): void {
    console.log(colors.blue('⚙️ Updating monitoring system configuration...'));
    
    if (config.monitoring) {
      this.monitoringService.updateConfig(config.monitoring);
    }
    
    if (config.alerting) {
      this.alertingService.updateConfig(config.alerting);
    }
    
    if (config.retention) {
      this.retentionService.updateConfig(config.retention);
    }
    
    console.log(colors.green('✅ Configuration updated'));
    
    this.emit('configurationUpdated', {
      timestamp: Date.now(),
      config
    });
  }
  
  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Get system health summary
   */
  getHealthSummary(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // Check if monitoring is active
    const monitoringStats = this.monitoringService.getMonitoringStats();
    if (!monitoringStats.isActive) {
      issues.push('Monitoring service is not active');
      recommendations.push('Start monitoring service');
    }
    
    // Check for active critical alerts
    const criticalAlerts = this.alertingService.getAlertsBySeverity('critical');
    const emergencyAlerts = this.alertingService.getAlertsBySeverity('emergency');
    
    if (emergencyAlerts.length > 0) {
      issues.push(`${emergencyAlerts.length} emergency alerts active`);
      recommendations.push('Address emergency alerts immediately');
    }
    
    if (criticalAlerts.length > 0) {
      issues.push(`${criticalAlerts.length} critical alerts active`);
      recommendations.push('Review and resolve critical alerts');
    }
    
    // Check data freshness
    const now = Date.now();
    const dataAge = now - monitoringStats.lastUpdate;
    if (dataAge > 5 * 60 * 1000) { // 5 minutes
      issues.push('Monitoring data is stale');
      recommendations.push('Check monitoring service connectivity');
    }
    
    // Determine overall status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    if (emergencyAlerts.length > 0 || !monitoringStats.isActive) {
      status = 'critical';
    } else if (criticalAlerts.length > 0 || dataAge > 2 * 60 * 1000) {
      status = 'warning';
    }
    
    return {
      status,
      issues,
      recommendations
    };
  }
  
  /**
   * Shutdown the complete monitoring system
   */
  shutdown(): void {
    console.log(colors.blue('🛑 Shutting down Monitoring Orchestrator...'));
    
    this.stopMonitoring();
    
    // Shutdown individual services
    this.monitoringService.shutdown();
    this.alertingService.shutdown();
    this.retentionService.shutdown();
    
    this.removeAllListeners();
    
    console.log(colors.gray('✅ Monitoring Orchestrator shutdown complete'));
  }
}

/**
 * Singleton orchestrator instance
 */
let orchestratorInstance: MonitoringOrchestrator | null = null;

/**
 * Get or create the global monitoring orchestrator instance
 */
export function getMonitoringOrchestrator(config?: MonitoringSystemConfig): MonitoringOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new MonitoringOrchestrator(config);
  }
  return orchestratorInstance;
}

/**
 * Reset the global monitoring orchestrator instance (for testing)
 */
export function resetMonitoringOrchestrator(): void {
  if (orchestratorInstance) {
    orchestratorInstance.shutdown();
  }
  orchestratorInstance = null;
}