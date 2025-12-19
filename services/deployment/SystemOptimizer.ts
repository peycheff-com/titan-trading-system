/**
 * System-Level Optimizer
 * 
 * Configures log rotation to prevent disk issues and tunes kernel parameters
 * for high-frequency trading operations with minimal latency and maximum throughput.
 */

import { EventEmitter } from 'events';
import { execSync, exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SystemOptimizationConfig {
  // Log rotation configuration
  logRotation: {
    maxSize: string; // e.g., "100M"
    maxAge: number; // days
    maxFiles: number;
    compress: boolean;
    frequency: 'daily' | 'weekly' | 'monthly';
  };
  
  // Kernel parameters for high-frequency trading
  kernelParams: {
    // Network optimization
    netCoreRmemMax: number;
    netCoreWmemMax: number;
    netCoreNetdevMaxBacklog: number;
    netCoreSomaxconn: number;
    
    // TCP optimization
    tcpRmem: [number, number, number];
    tcpWmem: [number, number, number];
    tcpCongestionControl: string;
    tcpNoDelay: boolean;
    
    // Memory optimization
    vmSwappiness: number;
    vmDirtyRatio: number;
    vmDirtyBackgroundRatio: number;
    vmOvercommitMemory: number;
    
    // File system optimization
    fsFileMax: number;
    fsNrOpen: number;
    
    // Process optimization
    kernelPidMax: number;
    kernelThreadsMax: number;
  };
  
  // CPU optimization
  cpuOptimization: {
    governor: 'performance' | 'powersave' | 'ondemand';
    isolateCpus: number[]; // CPU cores to isolate for trading processes
    irqAffinity: number[]; // CPU cores for IRQ handling
  };
  
  // Disk I/O optimization
  diskOptimization: {
    scheduler: 'noop' | 'deadline' | 'cfq' | 'mq-deadline';
    readAhead: number; // KB
    queueDepth: number;
  };
}

export interface SystemMetrics {
  cpu: {
    usage: number;
    loadAverage: [number, number, number];
    contextSwitches: number;
    interrupts: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    cached: number;
    swapUsed: number;
  };
  disk: {
    usage: number;
    iops: number;
    latency: number;
    throughput: number;
  };
  network: {
    rxPackets: number;
    txPackets: number;
    rxBytes: number;
    txBytes: number;
    errors: number;
  };
  system: {
    uptime: number;
    processes: number;
    openFiles: number;
    loadAverage: number;
  };
}

export interface LogRotationRule {
  logPath: string;
  maxSize: string;
  maxAge: number;
  maxFiles: number;
  compress: boolean;
  postRotate?: string; // Command to run after rotation
}

/**
 * System-Level Optimizer
 * 
 * Implements system-level optimizations including:
 * - Log rotation configuration to prevent disk space issues
 * - Kernel parameter tuning for high-frequency trading
 * - CPU governor and affinity optimization
 * - Disk I/O scheduler optimization
 * - Network stack tuning for low latency
 */
export class SystemOptimizer extends EventEmitter {
  private config: SystemOptimizationConfig;
  private logRotationRules: Map<string, LogRotationRule> = new Map();
  private originalKernelParams: Map<string, string> = new Map();

  constructor(config: SystemOptimizationConfig) {
    super();
    this.config = config;
  }

  /**
   * Apply all system-level optimizations
   */
  async applyOptimizations(): Promise<void> {
    try {
      // Backup original kernel parameters
      await this.backupKernelParams();
      
      // Apply kernel parameter optimizations
      await this.applyKernelOptimizations();
      
      // Apply CPU optimizations
      await this.applyCpuOptimizations();
      
      // Apply disk I/O optimizations
      await this.applyDiskOptimizations();
      
      // Configure log rotation
      await this.configureLogRotation();
      
      // Verify optimizations
      await this.verifyOptimizations();
      
      this.emit('optimizations-applied', {
        timestamp: new Date(),
        config: this.config
      });
    } catch (error) {
      this.emit('optimization-error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Backup original kernel parameters for rollback
   */
  private async backupKernelParams(): Promise<void> {
    const params = [
      'net.core.rmem_max',
      'net.core.wmem_max',
      'net.core.netdev_max_backlog',
      'net.core.somaxconn',
      'net.ipv4.tcp_rmem',
      'net.ipv4.tcp_wmem',
      'net.ipv4.tcp_congestion_control',
      'vm.swappiness',
      'vm.dirty_ratio',
      'vm.dirty_background_ratio',
      'vm.overcommit_memory',
      'fs.file-max',
      'fs.nr_open',
      'kernel.pid_max',
      'kernel.threads-max'
    ];
    
    for (const param of params) {
      try {
        const { stdout } = await execAsync(`sysctl -n ${param}`);
        this.originalKernelParams.set(param, stdout.trim());
      } catch (error) {
        // Parameter might not exist on this system
        console.warn(`Could not backup parameter ${param}:`, error);
      }
    }
    
    this.emit('kernel-params-backed-up', {
      count: this.originalKernelParams.size,
      timestamp: new Date()
    });
  }

  /**
   * Apply kernel parameter optimizations
   */
  private async applyKernelOptimizations(): Promise<void> {
    const { kernelParams } = this.config;
    
    const sysctlCommands = [
      // Network optimization
      `sysctl -w net.core.rmem_max=${kernelParams.netCoreRmemMax}`,
      `sysctl -w net.core.wmem_max=${kernelParams.netCoreWmemMax}`,
      `sysctl -w net.core.netdev_max_backlog=${kernelParams.netCoreNetdevMaxBacklog}`,
      `sysctl -w net.core.somaxconn=${kernelParams.netCoreSomaxconn}`,
      
      // TCP optimization
      `sysctl -w net.ipv4.tcp_rmem="${kernelParams.tcpRmem.join(' ')}"`,
      `sysctl -w net.ipv4.tcp_wmem="${kernelParams.tcpWmem.join(' ')}"`,
      `sysctl -w net.ipv4.tcp_congestion_control=${kernelParams.tcpCongestionControl}`,
      `sysctl -w net.ipv4.tcp_nodelay=${kernelParams.tcpNoDelay ? 1 : 0}`,
      
      // Memory optimization
      `sysctl -w vm.swappiness=${kernelParams.vmSwappiness}`,
      `sysctl -w vm.dirty_ratio=${kernelParams.vmDirtyRatio}`,
      `sysctl -w vm.dirty_background_ratio=${kernelParams.vmDirtyBackgroundRatio}`,
      `sysctl -w vm.overcommit_memory=${kernelParams.vmOvercommitMemory}`,
      
      // File system optimization
      `sysctl -w fs.file-max=${kernelParams.fsFileMax}`,
      `sysctl -w fs.nr_open=${kernelParams.fsNrOpen}`,
      
      // Process optimization
      `sysctl -w kernel.pid_max=${kernelParams.kernelPidMax}`,
      `sysctl -w kernel.threads-max=${kernelParams.kernelThreadsMax}`
    ];
    
    for (const command of sysctlCommands) {
      try {
        execSync(command, { stdio: 'ignore' });
      } catch (error) {
        console.warn(`Failed to execute: ${command}`, error);
      }
    }
    
    // Make changes persistent
    await this.makeSysctlPersistent();
    
    this.emit('kernel-optimizations-applied', {
      timestamp: new Date()
    });
  }

  /**
   * Make sysctl changes persistent across reboots
   */
  private async makeSysctlPersistent(): Promise<void> {
    const { kernelParams } = this.config;
    
    const sysctlConfig = [
      '# Titan Trading System - Kernel Optimizations',
      `# Generated at: ${new Date().toISOString()}`,
      '',
      '# Network optimization',
      `net.core.rmem_max = ${kernelParams.netCoreRmemMax}`,
      `net.core.wmem_max = ${kernelParams.netCoreWmemMax}`,
      `net.core.netdev_max_backlog = ${kernelParams.netCoreNetdevMaxBacklog}`,
      `net.core.somaxconn = ${kernelParams.netCoreSomaxconn}`,
      '',
      '# TCP optimization',
      `net.ipv4.tcp_rmem = ${kernelParams.tcpRmem.join(' ')}`,
      `net.ipv4.tcp_wmem = ${kernelParams.tcpWmem.join(' ')}`,
      `net.ipv4.tcp_congestion_control = ${kernelParams.tcpCongestionControl}`,
      `net.ipv4.tcp_nodelay = ${kernelParams.tcpNoDelay ? 1 : 0}`,
      '',
      '# Memory optimization',
      `vm.swappiness = ${kernelParams.vmSwappiness}`,
      `vm.dirty_ratio = ${kernelParams.vmDirtyRatio}`,
      `vm.dirty_background_ratio = ${kernelParams.vmDirtyBackgroundRatio}`,
      `vm.overcommit_memory = ${kernelParams.vmOvercommitMemory}`,
      '',
      '# File system optimization',
      `fs.file-max = ${kernelParams.fsFileMax}`,
      `fs.nr_open = ${kernelParams.fsNrOpen}`,
      '',
      '# Process optimization',
      `kernel.pid_max = ${kernelParams.kernelPidMax}`,
      `kernel.threads-max = ${kernelParams.kernelThreadsMax}`
    ];
    
    const configPath = '/etc/sysctl.d/99-titan-trading.conf';
    await fs.writeFile(configPath, sysctlConfig.join('\n') + '\n', 'utf8');
    
    this.emit('sysctl-config-written', {
      path: configPath,
      timestamp: new Date()
    });
  }

  /**
   * Apply CPU optimizations
   */
  private async applyCpuOptimizations(): Promise<void> {
    const { cpuOptimization } = this.config;
    
    try {
      // Set CPU governor
      const cpuCount = parseInt(execSync('nproc', { encoding: 'utf8' }).trim());
      for (let i = 0; i < cpuCount; i++) {
        try {
          execSync(`echo ${cpuOptimization.governor} > /sys/devices/system/cpu/cpu${i}/cpufreq/scaling_governor`, { stdio: 'ignore' });
        } catch (error) {
          // CPU might not support frequency scaling
        }
      }
      
      // Isolate CPUs for trading processes
      if (cpuOptimization.isolateCpus.length > 0) {
        const isolatedCpus = cpuOptimization.isolateCpus.join(',');
        // This would typically be done via kernel boot parameters
        console.log(`CPU isolation should be configured via boot parameters: isolcpus=${isolatedCpus}`);
      }
      
      // Set IRQ affinity
      if (cpuOptimization.irqAffinity.length > 0) {
        const irqCpus = cpuOptimization.irqAffinity.join(',');
        try {
          execSync(`echo ${irqCpus} > /proc/irq/default_smp_affinity`, { stdio: 'ignore' });
        } catch (error) {
          console.warn('Failed to set IRQ affinity:', error);
        }
      }
      
      this.emit('cpu-optimizations-applied', {
        governor: cpuOptimization.governor,
        isolatedCpus: cpuOptimization.isolateCpus,
        timestamp: new Date()
      });
    } catch (error) {
      console.warn('CPU optimization failed:', error);
    }
  }

  /**
   * Apply disk I/O optimizations
   */
  private async applyDiskOptimizations(): Promise<void> {
    const { diskOptimization } = this.config;
    
    try {
      // Get all block devices
      const { stdout } = await execAsync('lsblk -d -n -o NAME');
      const devices = stdout.trim().split('\n').filter(device => device.trim());
      
      for (const device of devices) {
        const devicePath = `/sys/block/${device.trim()}`;
        
        try {
          // Set I/O scheduler
          await fs.writeFile(`${devicePath}/queue/scheduler`, diskOptimization.scheduler);
          
          // Set read-ahead
          await fs.writeFile(`${devicePath}/queue/read_ahead_kb`, diskOptimization.readAhead.toString());
          
          // Set queue depth
          await fs.writeFile(`${devicePath}/queue/nr_requests`, diskOptimization.queueDepth.toString());
          
        } catch (error) {
          console.warn(`Failed to optimize device ${device}:`, error);
        }
      }
      
      this.emit('disk-optimizations-applied', {
        devices: devices.length,
        scheduler: diskOptimization.scheduler,
        timestamp: new Date()
      });
    } catch (error) {
      console.warn('Disk optimization failed:', error);
    }
  }

  /**
   * Configure log rotation for all system and application logs
   */
  async configureLogRotation(): Promise<void> {
    const { logRotation } = this.config;
    
    // Default log rotation rules for Titan services
    const defaultRules: LogRotationRule[] = [
      {
        logPath: '/var/log/titan/*.log',
        maxSize: logRotation.maxSize,
        maxAge: logRotation.maxAge,
        maxFiles: logRotation.maxFiles,
        compress: logRotation.compress,
        postRotate: 'systemctl reload rsyslog'
      },
      {
        logPath: '/var/log/redis/redis.log',
        maxSize: logRotation.maxSize,
        maxAge: logRotation.maxAge,
        maxFiles: logRotation.maxFiles,
        compress: logRotation.compress
      },
      {
        logPath: '/var/log/nginx/*.log',
        maxSize: logRotation.maxSize,
        maxAge: logRotation.maxAge,
        maxFiles: logRotation.maxFiles,
        compress: logRotation.compress,
        postRotate: 'nginx -s reload'
      }
    ];
    
    for (const rule of defaultRules) {
      await this.addLogRotationRule(rule.logPath, rule);
    }
    
    // Generate logrotate configuration
    await this.generateLogrotateConfig();
    
    this.emit('log-rotation-configured', {
      rules: this.logRotationRules.size,
      timestamp: new Date()
    });
  }

  /**
   * Add a log rotation rule
   */
  async addLogRotationRule(name: string, rule: LogRotationRule): Promise<void> {
    this.logRotationRules.set(name, rule);
    this.emit('log-rotation-rule-added', { name, rule });
  }

  /**
   * Generate logrotate configuration file
   */
  private async generateLogrotateConfig(): Promise<void> {
    const configLines: string[] = [
      '# Titan Trading System - Log Rotation Configuration',
      `# Generated at: ${new Date().toISOString()}`,
      ''
    ];
    
    for (const [name, rule] of Array.from(this.logRotationRules.entries())) {
      configLines.push(`${rule.logPath} {`);
      configLines.push(`    ${this.config.logRotation.frequency}`);
      configLines.push(`    size ${rule.maxSize}`);
      configLines.push(`    rotate ${rule.maxFiles}`);
      configLines.push(`    maxage ${rule.maxAge}`);
      
      if (rule.compress) {
        configLines.push('    compress');
        configLines.push('    delaycompress');
      }
      
      configLines.push('    missingok');
      configLines.push('    notifempty');
      configLines.push('    create 0644 root root');
      
      if (rule.postRotate) {
        configLines.push('    postrotate');
        configLines.push(`        ${rule.postRotate}`);
        configLines.push('    endscript');
      }
      
      configLines.push('}');
      configLines.push('');
    }
    
    const configPath = '/etc/logrotate.d/titan-trading';
    await fs.writeFile(configPath, configLines.join('\n'), 'utf8');
    
    this.emit('logrotate-config-written', {
      path: configPath,
      timestamp: new Date()
    });
  }

  /**
   * Get current system metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      const [cpuInfo, memInfo, diskInfo, netInfo] = await Promise.all([
        this.getCpuMetrics(),
        this.getMemoryMetrics(),
        this.getDiskMetrics(),
        this.getNetworkMetrics()
      ]);
      
      return {
        cpu: cpuInfo,
        memory: memInfo,
        disk: diskInfo,
        network: netInfo,
        system: await this.getSystemInfo()
      };
    } catch (error) {
      throw new Error(`Failed to get system metrics: ${error}`);
    }
  }

  /**
   * Get CPU metrics
   */
  private async getCpuMetrics(): Promise<SystemMetrics['cpu']> {
    const { stdout: loadAvg } = await execAsync('cat /proc/loadavg');
    const [load1, load5, load15] = loadAvg.trim().split(' ').map(Number);
    
    const { stdout: stat } = await execAsync('cat /proc/stat');
    const cpuLine = stat.split('\n')[0];
    const cpuValues = cpuLine.split(/\s+/).slice(1).map(Number);
    const totalTime = cpuValues.reduce((sum, val) => sum + val, 0);
    const idleTime = cpuValues[3] + cpuValues[4]; // idle + iowait
    const usage = ((totalTime - idleTime) / totalTime) * 100;
    
    return {
      usage,
      loadAverage: [load1, load5, load15],
      contextSwitches: 0, // Would need to parse /proc/stat for ctxt
      interrupts: 0 // Would need to parse /proc/stat for intr
    };
  }

  /**
   * Get memory metrics
   */
  private async getMemoryMetrics(): Promise<SystemMetrics['memory']> {
    const { stdout } = await execAsync('cat /proc/meminfo');
    const memInfo: Record<string, number> = {};
    
    for (const line of stdout.split('\n')) {
      const match = line.match(/^(\w+):\s+(\d+)\s+kB/);
      if (match) {
        memInfo[match[1]] = parseInt(match[2]) * 1024; // Convert to bytes
      }
    }
    
    return {
      total: memInfo.MemTotal || 0,
      used: (memInfo.MemTotal || 0) - (memInfo.MemAvailable || 0),
      free: memInfo.MemAvailable || 0,
      cached: memInfo.Cached || 0,
      swapUsed: (memInfo.SwapTotal || 0) - (memInfo.SwapFree || 0)
    };
  }

  /**
   * Get disk metrics
   */
  private async getDiskMetrics(): Promise<SystemMetrics['disk']> {
    const { stdout } = await execAsync('df / | tail -1');
    const [, , , , usagePercent] = stdout.trim().split(/\s+/);
    const usage = parseInt(usagePercent.replace('%', ''));
    
    return {
      usage,
      iops: 0, // Would need iostat or similar
      latency: 0, // Would need iostat or similar
      throughput: 0 // Would need iostat or similar
    };
  }

  /**
   * Get network metrics
   */
  private async getNetworkMetrics(): Promise<SystemMetrics['network']> {
    const { stdout } = await execAsync('cat /proc/net/dev');
    const lines = stdout.split('\n').slice(2); // Skip header lines
    
    let rxPackets = 0, txPackets = 0, rxBytes = 0, txBytes = 0, errors = 0;
    
    for (const line of lines) {
      if (line.trim()) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 17) {
          rxBytes += parseInt(parts[1]) || 0;
          rxPackets += parseInt(parts[2]) || 0;
          errors += parseInt(parts[3]) || 0;
          txBytes += parseInt(parts[9]) || 0;
          txPackets += parseInt(parts[10]) || 0;
          errors += parseInt(parts[11]) || 0;
        }
      }
    }
    
    return { rxPackets, txPackets, rxBytes, txBytes, errors };
  }

  /**
   * Get system information
   */
  private async getSystemInfo(): Promise<SystemMetrics['system']> {
    const { stdout: uptime } = await execAsync('cat /proc/uptime');
    const uptimeSeconds = parseFloat(uptime.split(' ')[0]);
    
    const { stdout: processes } = await execAsync('ps aux | wc -l');
    const processCount = parseInt(processes.trim()) - 1; // Subtract header
    
    const { stdout: openFiles } = await execAsync('lsof | wc -l');
    const openFileCount = parseInt(openFiles.trim());
    
    const { stdout: loadAvg } = await execAsync('cat /proc/loadavg');
    const loadAverage = parseFloat(loadAvg.split(' ')[0]);
    
    return {
      uptime: uptimeSeconds,
      processes: processCount,
      openFiles: openFileCount,
      loadAverage
    };
  }

  /**
   * Verify that optimizations were applied successfully
   */
  private async verifyOptimizations(): Promise<void> {
    const issues: string[] = [];
    
    // Verify kernel parameters
    for (const [param, expectedValue] of Object.entries({
      'net.core.somaxconn': this.config.kernelParams.netCoreSomaxconn.toString(),
      'vm.swappiness': this.config.kernelParams.vmSwappiness.toString()
    })) {
      try {
        const { stdout } = await execAsync(`sysctl -n ${param}`);
        if (stdout.trim() !== expectedValue) {
          issues.push(`Kernel parameter ${param} not set correctly`);
        }
      } catch (error) {
        issues.push(`Could not verify kernel parameter ${param}`);
      }
    }
    
    // Verify logrotate configuration
    try {
      await fs.access('/etc/logrotate.d/titan-trading');
    } catch {
      issues.push('Logrotate configuration not found');
    }
    
    if (issues.length > 0) {
      throw new Error(`Optimization verification failed: ${issues.join(', ')}`);
    }
    
    this.emit('optimizations-verified', {
      timestamp: new Date()
    });
  }

  /**
   * Rollback system optimizations to original state
   */
  async rollbackOptimizations(): Promise<void> {
    try {
      // Restore original kernel parameters
      for (const [param, originalValue] of Array.from(this.originalKernelParams.entries())) {
        try {
          execSync(`sysctl -w ${param}=${originalValue}`, { stdio: 'ignore' });
        } catch (error) {
          console.warn(`Failed to restore ${param}:`, error);
        }
      }
      
      // Remove custom sysctl configuration
      try {
        await fs.unlink('/etc/sysctl.d/99-titan-trading.conf');
      } catch (error) {
        // File might not exist
      }
      
      // Remove logrotate configuration
      try {
        await fs.unlink('/etc/logrotate.d/titan-trading');
      } catch (error) {
        // File might not exist
      }
      
      this.emit('optimizations-rolled-back', {
        timestamp: new Date()
      });
    } catch (error) {
      throw new Error(`Rollback failed: ${error}`);
    }
  }

  /**
   * Get optimization configuration
   */
  getConfig(): SystemOptimizationConfig {
    return { ...this.config };
  }

  /**
   * Update optimization configuration
   */
  updateConfig(newConfig: Partial<SystemOptimizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config-updated', this.config);
  }
}

/**
 * Default system optimization configuration for high-frequency trading
 */
export const DEFAULT_SYSTEM_CONFIG: SystemOptimizationConfig = {
  logRotation: {
    maxSize: '100M',
    maxAge: 30,
    maxFiles: 10,
    compress: true,
    frequency: 'daily'
  },
  kernelParams: {
    // Network optimization for low latency
    netCoreRmemMax: 134217728, // 128MB
    netCoreWmemMax: 134217728, // 128MB
    netCoreNetdevMaxBacklog: 5000,
    netCoreSomaxconn: 65535,
    
    // TCP optimization
    tcpRmem: [4096, 65536, 134217728],
    tcpWmem: [4096, 65536, 134217728],
    tcpCongestionControl: 'bbr',
    tcpNoDelay: true,
    
    // Memory optimization
    vmSwappiness: 1, // Minimize swapping
    vmDirtyRatio: 15,
    vmDirtyBackgroundRatio: 5,
    vmOvercommitMemory: 1,
    
    // File system optimization
    fsFileMax: 2097152,
    fsNrOpen: 1048576,
    
    // Process optimization
    kernelPidMax: 4194304,
    kernelThreadsMax: 1000000
  },
  cpuOptimization: {
    governor: 'performance',
    isolateCpus: [], // Configure based on system
    irqAffinity: [0, 1] // Use first two cores for IRQ
  },
  diskOptimization: {
    scheduler: 'mq-deadline',
    readAhead: 256, // KB
    queueDepth: 32
  }
};