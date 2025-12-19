/**
 * Production Monitoring Service for Titan Trading System
 * 
 * Provides comprehensive system and trading metrics monitoring with
 * 30-second intervals, data retention, and alerting capabilities.
 * 
 * Requirements: 5.1, 5.2 - System and trading metrics monitoring
 */

import { EventEmitter } from 'eventemitter3';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getPerformanceMonitor, type PerformanceMetrics } from '../shared/src/PerformanceMonitor';
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
 * System metrics collected every 30 seconds
 */
export interface SystemMetrics {
  timestamp: number;
  cpu: {
    usage: number; // Percentage
    loadAverage: number[];
    cores: number;
  };
  memory: {
    total: number; // Bytes
    used: number; // Bytes
    free: number; // Bytes
    usage: number; // Percentage
    heapUsed: number; // Bytes
    heapTotal: number; // Bytes
  };
  disk: {
    total: number; // Bytes
    used: number; // Bytes
    free: number; // Bytes
    usage: number; // Percentage
  };
  network: {
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
  };
}

/**
 * Trading metrics for live trading operations
 */
export interface TradingMetrics {
  timestamp: number;
  equity: {
    total: number;
    available: number;
    unrealized: number;
  };
  drawdown: {
    current: number; // Percentage
    maximum: number; // Percentage
    duration: number; // Minutes
  };
  positions: {
    total: number;
    long: number;
    short: number;
    totalNotional: number;
  };
  performance: {
    dailyPnL: number;
    weeklyPnL: number;
    monthlyPnL: number;
    winRate: number; // Percentage
    profitFactor: number;
    sharpeRatio: number;
  };
  phases: {
    phase1: PhaseMetrics;
    phase2: PhaseMetrics;
    phase3: PhaseMetrics;
  };
}

/**
 * Individual phase metrics
 */
export interface PhaseMetrics {
  active: boolean;
  equity: number;
  positions: number;
  dailyPnL: number;
  drawdown: number;
  trades: number;
  winRate: number;
}

/**
 * Combined monitoring data
 */
export interface MonitoringData {
  system: SystemMetrics;
  trading: TradingMetrics;
  performance: PerformanceMetrics;
}

/**
 * Monitoring configuration
 */
export interface MonitoringConfig {
  interval: number; // Monitoring interval in milliseconds (default: 30000)
  dataRetentionDays: number; // Days to retain metrics data (default: 30)
  metricsStoragePath: string; // Path to store metrics files
  enableSystemMetrics: boolean;
  enableTradingMetrics: boolean;
  enablePerformanceMetrics: boolean;
}

/**
 * Default monitoring configuration
 */
const DEFAULT_CONFIG: MonitoringConfig = {
  interval: 30000, // 30 seconds as required
  dataRetentionDays: 30,
  metricsStoragePath: './logs/metrics',
  enableSystemMetrics: true,
  enableTradingMetrics: true,
  enablePerformanceMetrics: true,
};

/**
 * Production Monitoring Service
 */
export class MonitoringService extends EventEmitter {
  private config: MonitoringConfig;
  private monitoringTimer: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  private metricsHistory: MonitoringData[] = [];
  private lastNetworkStats: any = null;
  private performanceMonitor = getPerformanceMonitor();
  private telemetry = getTelemetryService();
  
  constructor(config: Partial<MonitoringConfig> = {}) {
    super();
    
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    console.log(colors.blue('🔍 Production Monitoring Service initialized'));
    console.log(colors.gray(`   Interval: ${this.config.interval}ms`));
    console.log(colors.gray(`   Retention: ${this.config.dataRetentionDays} days`));
  }
  
  /**
   * Start monitoring with 30-second intervals
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log(colors.yellow('⚠️ Monitoring already active'));
      return;
    }
    
    this.isMonitoring = true;
    
    // Ensure metrics storage directory exists
    await this.ensureStorageDirectory();
    
    // Start performance monitor
    this.performanceMonitor.startMonitoring();
    
    // Start metrics collection timer
    this.monitoringTimer = setInterval(async () => {
      await this.collectMetrics();
    }, this.config.interval);
    
    // Collect initial metrics
    await this.collectMetrics();
    
    console.log(colors.green(`📊 Production monitoring started (${this.config.interval}ms interval)`));
    
    // Emit monitoring started event
    this.emit('monitoringStarted', {
      timestamp: Date.now(),
      interval: this.config.interval,
      retention: this.config.dataRetentionDays
    });
  }
  
  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }
    
    this.isMonitoring = false;
    
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
    
    // Stop performance monitor
    this.performanceMonitor.stopMonitoring();
    
    console.log(colors.yellow('📊 Production monitoring stopped'));
    
    // Emit monitoring stopped event
    this.emit('monitoringStopped', {
      timestamp: Date.now()
    });
  }
  
  /**
   * Collect comprehensive metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      const timestamp = Date.now();
      
      // Collect system metrics
      const systemMetrics = this.config.enableSystemMetrics ? 
        await this.collectSystemMetrics(timestamp) : null;
      
      // Collect trading metrics
      const tradingMetrics = this.config.enableTradingMetrics ? 
        await this.collectTradingMetrics(timestamp) : null;
      
      // Get performance metrics
      const performanceMetrics = this.config.enablePerformanceMetrics ? 
        this.performanceMonitor.getCurrentMetrics() : null;
      
      // Create monitoring data
      const monitoringData: MonitoringData = {
        system: systemMetrics!,
        trading: tradingMetrics!,
        performance: performanceMetrics!
      };
      
      // Store in memory
      this.metricsHistory.push(monitoringData);
      
      // Persist to disk
      await this.persistMetrics(monitoringData);
      
      // Clean up old data
      await this.cleanupOldData();
      
      // Emit metrics collected event
      this.emit('metricsCollected', monitoringData);
      
      // Log collection (every 10 minutes to avoid spam)
      if (this.metricsHistory.length % 20 === 0) { // 20 * 30s = 10 minutes
        console.log(colors.cyan(`📈 Metrics collected: ${this.metricsHistory.length} data points`));
      }
      
    } catch (error) {
      console.error(colors.red('❌ Failed to collect metrics:'), error);
      this.telemetry.logError('MonitoringService', 'Failed to collect metrics', { error: error.message });
    }
  }
  
  /**
   * Collect system metrics (CPU, memory, disk, network)
   */
  private async collectSystemMetrics(timestamp: number): Promise<SystemMetrics> {
    // CPU metrics
    const cpus = os.cpus();
    const loadAverage = os.loadavg();
    
    // Calculate CPU usage
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });
    
    const cpuUsage = 100 - ~~(100 * totalIdle / totalTick);
    
    // Memory metrics
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = (usedMemory / totalMemory) * 100;
    
    // Node.js heap metrics
    const memUsage = process.memoryUsage();
    
    // Disk metrics (simplified - would need platform-specific implementation for accuracy)
    const diskStats = await this.getDiskStats();
    
    // Network metrics
    const networkStats = await this.getNetworkStats();
    
    return {
      timestamp,
      cpu: {
        usage: cpuUsage,
        loadAverage,
        cores: cpus.length
      },
      memory: {
        total: totalMemory,
        used: usedMemory,
        free: freeMemory,
        usage: memoryUsage,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal
      },
      disk: diskStats,
      network: networkStats
    };
  }
  
  /**
   * Collect trading metrics from Titan system
   */
  private async collectTradingMetrics(timestamp: number): Promise<TradingMetrics> {
    // This would integrate with the actual Titan trading system
    // For now, we'll create a mock implementation that can be replaced
    
    // In a real implementation, this would:
    // 1. Connect to the Titan Brain service
    // 2. Query current equity from all exchanges
    // 3. Calculate drawdown from historical data
    // 4. Get position data from all phases
    // 5. Calculate performance metrics
    
    return {
      timestamp,
      equity: {
        total: 10000, // Mock data - replace with actual equity query
        available: 8500,
        unrealized: 1500
      },
      drawdown: {
        current: 2.5,
        maximum: 8.2,
        duration: 45
      },
      positions: {
        total: 3,
        long: 2,
        short: 1,
        totalNotional: 25000
      },
      performance: {
        dailyPnL: 150.75,
        weeklyPnL: 892.30,
        monthlyPnL: 3245.80,
        winRate: 68.5,
        profitFactor: 1.85,
        sharpeRatio: 2.1
      },
      phases: {
        phase1: {
          active: true,
          equity: 3000,
          positions: 1,
          dailyPnL: 45.20,
          drawdown: 1.8,
          trades: 12,
          winRate: 75.0
        },
        phase2: {
          active: true,
          equity: 4500,
          positions: 2,
          dailyPnL: 105.55,
          drawdown: 3.2,
          trades: 8,
          winRate: 62.5
        },
        phase3: {
          active: false,
          equity: 0,
          positions: 0,
          dailyPnL: 0,
          drawdown: 0,
          trades: 0,
          winRate: 0
        }
      }
    };
  }
  
  /**
   * Get disk usage statistics
   */
  private async getDiskStats(): Promise<{ total: number; used: number; free: number; usage: number }> {
    try {
      // This is a simplified implementation
      // In production, you'd want to use a proper disk usage library
      const stats = await fs.stat('.');
      
      // Mock disk stats - replace with actual disk usage calculation
      return {
        total: 100 * 1024 * 1024 * 1024, // 100GB
        used: 45 * 1024 * 1024 * 1024,   // 45GB
        free: 55 * 1024 * 1024 * 1024,   // 55GB
        usage: 45 // 45%
      };
    } catch (error) {
      return {
        total: 0,
        used: 0,
        free: 0,
        usage: 0
      };
    }
  }
  
  /**
   * Get network statistics
   */
  private async getNetworkStats(): Promise<{ bytesReceived: number; bytesSent: number; packetsReceived: number; packetsSent: number }> {
    try {
      // This would need platform-specific implementation
      // For now, return mock data
      const currentStats = {
        bytesReceived: Math.floor(Math.random() * 1000000),
        bytesSent: Math.floor(Math.random() * 1000000),
        packetsReceived: Math.floor(Math.random() * 10000),
        packetsSent: Math.floor(Math.random() * 10000)
      };
      
      if (this.lastNetworkStats) {
        // Return delta since last measurement
        return {
          bytesReceived: Math.max(0, currentStats.bytesReceived - this.lastNetworkStats.bytesReceived),
          bytesSent: Math.max(0, currentStats.bytesSent - this.lastNetworkStats.bytesSent),
          packetsReceived: Math.max(0, currentStats.packetsReceived - this.lastNetworkStats.packetsReceived),
          packetsSent: Math.max(0, currentStats.packetsSent - this.lastNetworkStats.packetsSent)
        };
      }
      
      this.lastNetworkStats = currentStats;
      return currentStats;
    } catch (error) {
      return {
        bytesReceived: 0,
        bytesSent: 0,
        packetsReceived: 0,
        packetsSent: 0
      };
    }
  }
  
  /**
   * Persist metrics to disk for historical analysis
   */
  private async persistMetrics(data: MonitoringData): Promise<void> {
    try {
      const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const filename = `metrics-${date}.jsonl`;
      const filepath = path.join(this.config.metricsStoragePath, filename);
      
      const line = JSON.stringify(data) + '\n';
      await fs.appendFile(filepath, line);
      
    } catch (error) {
      console.error(colors.red('❌ Failed to persist metrics:'), error);
    }
  }
  
  /**
   * Ensure metrics storage directory exists
   */
  private async ensureStorageDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.config.metricsStoragePath, { recursive: true });
    } catch (error) {
      console.error(colors.red('❌ Failed to create metrics storage directory:'), error);
      throw error;
    }
  }
  
  /**
   * Clean up old metrics data based on retention policy
   */
  private async cleanupOldData(): Promise<void> {
    try {
      // Clean up in-memory data
      const maxAge = this.config.dataRetentionDays * 24 * 60 * 60 * 1000;
      const cutoff = Date.now() - maxAge;
      
      this.metricsHistory = this.metricsHistory.filter(data => data.system.timestamp > cutoff);
      
      // Clean up disk files
      const files = await fs.readdir(this.config.metricsStoragePath);
      const cutoffDate = new Date(cutoff).toISOString().split('T')[0];
      
      for (const file of files) {
        if (file.startsWith('metrics-') && file.endsWith('.jsonl')) {
          const fileDate = file.substring(8, 18); // Extract YYYY-MM-DD
          if (fileDate < cutoffDate) {
            await fs.unlink(path.join(this.config.metricsStoragePath, file));
            console.log(colors.gray(`🗑️ Cleaned up old metrics file: ${file}`));
          }
        }
      }
      
    } catch (error) {
      console.error(colors.red('❌ Failed to cleanup old data:'), error);
    }
  }
  
  /**
   * Get current system metrics
   */
  getCurrentSystemMetrics(): SystemMetrics | null {
    const latest = this.metricsHistory[this.metricsHistory.length - 1];
    return latest ? latest.system : null;
  }
  
  /**
   * Get current trading metrics
   */
  getCurrentTradingMetrics(): TradingMetrics | null {
    const latest = this.metricsHistory[this.metricsHistory.length - 1];
    return latest ? latest.trading : null;
  }
  
  /**
   * Get metrics history for specified time range
   */
  getMetricsHistory(hours: number = 24): MonitoringData[] {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    return this.metricsHistory.filter(data => data.system.timestamp > cutoff);
  }
  
  /**
   * Get monitoring statistics
   */
  getMonitoringStats(): {
    isActive: boolean;
    dataPoints: number;
    lastUpdate: number;
    retentionDays: number;
    storageSize: number;
  } {
    const latest = this.metricsHistory[this.metricsHistory.length - 1];
    
    return {
      isActive: this.isMonitoring,
      dataPoints: this.metricsHistory.length,
      lastUpdate: latest ? latest.system.timestamp : 0,
      retentionDays: this.config.dataRetentionDays,
      storageSize: this.metricsHistory.length * 1024 // Rough estimate
    };
  }
  
  /**
   * Update monitoring configuration
   */
  updateConfig(config: Partial<MonitoringConfig>): void {
    const oldInterval = this.config.interval;
    this.config = { ...this.config, ...config };
    
    // Restart monitoring if interval changed
    if (this.isMonitoring && config.interval && config.interval !== oldInterval) {
      console.log(colors.blue(`⚙️ Restarting monitoring with new interval: ${config.interval}ms`));
      this.stopMonitoring();
      setTimeout(() => this.startMonitoring(), 1000);
    }
    
    console.log(colors.blue('⚙️ Monitoring configuration updated'));
  }
  
  /**
   * Export metrics data for analysis
   */
  async exportMetrics(hours: number = 24): Promise<string> {
    const data = this.getMetricsHistory(hours);
    return JSON.stringify(data, null, 2);
  }
  
  /**
   * Shutdown monitoring service
   */
  shutdown(): void {
    console.log(colors.blue('🛑 Shutting down Monitoring Service...'));
    this.stopMonitoring();
    this.metricsHistory = [];
    this.removeAllListeners();
  }
}

/**
 * Singleton monitoring service instance
 */
let monitoringServiceInstance: MonitoringService | null = null;

/**
 * Get or create the global monitoring service instance
 */
export function getMonitoringService(config?: Partial<MonitoringConfig>): MonitoringService {
  if (!monitoringServiceInstance) {
    monitoringServiceInstance = new MonitoringService(config);
  }
  return monitoringServiceInstance;
}

/**
 * Reset the global monitoring service instance (for testing)
 */
export function resetMonitoringService(): void {
  if (monitoringServiceInstance) {
    monitoringServiceInstance.shutdown();
  }
  monitoringServiceInstance = null;
}