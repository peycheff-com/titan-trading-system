/**
 * PM2 Process Manager
 * 
 * Manages PM2 process lifecycle with auto-restart, monitoring, and log management.
 * Implements Requirements 2.4, 2.5 for PM2 configuration and log rotation.
 */

import { EventEmitter } from 'events';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export interface PM2ProcessConfig {
  name: string;
  script: string;
  cwd?: string;
  instances: number | 'max';
  exec_mode: 'fork' | 'cluster';
  env: Record<string, string>;
  max_memory_restart: string;
  min_uptime: string;
  max_restarts: number;
  restart_delay: number;
  autorestart: boolean;
  watch: boolean | string[];
  ignore_watch: string[];
  log_file: string;
  out_file: string;
  error_file: string;
  log_date_format: string;
  merge_logs: boolean;
  kill_timeout: number;
}

export interface PM2ProcessStatus {
  name: string;
  pid: number;
  status: 'online' | 'stopped' | 'stopping' | 'waiting restart' | 'launching' | 'errored' | 'one-launch-status';
  restart_time: number;
  created_at: number;
  pm_uptime: number;
  memory: number;
  cpu: number;
  monit: {
    memory: number;
    cpu: number;
  };
}

export interface LogRotationConfig {
  max_size: string;
  retain: number;
  compress: boolean;
  dateFormat: string;
  workerInterval: number;
  rotateInterval: string;
}

/**
 * PM2 Process Manager
 * 
 * Provides comprehensive PM2 process management with auto-restart, monitoring,
 * and log rotation capabilities for production deployment.
 */
export class PM2Manager extends EventEmitter {
  private logRotationConfig: LogRotationConfig;
  private isInitialized = false;

  constructor() {
    super();
    
    // Default log rotation configuration
    // Requirement 2.5: Implement service log rotation and compression
    this.logRotationConfig = {
      max_size: '10M',
      retain: 30,
      compress: true,
      dateFormat: 'YYYY-MM-DD_HH-mm-ss',
      workerInterval: 30,
      rotateInterval: '0 0 * * *' // Daily at midnight
    };
  }

  /**
   * Initialize PM2 and install required modules
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Check if PM2 is installed
      await execAsync('pm2 --version');
    } catch {
      throw new Error('PM2 is not installed. Please install PM2 globally: npm install -g pm2');
    }

    try {
      // Install PM2 log rotate module for log management
      await execAsync('pm2 install pm2-logrotate');
      
      // Configure log rotation
      await this.configureLogRotation();
      
      this.isInitialized = true;
      this.emit('pm2:initialized');
    } catch (error) {
      throw new Error(`Failed to initialize PM2: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Configure PM2 log rotation
   * Requirement 2.5: Service log rotation and compression
   */
  private async configureLogRotation(): Promise<void> {
    const rotateCommands = [
      `pm2 set pm2-logrotate:max_size ${this.logRotationConfig.max_size}`,
      `pm2 set pm2-logrotate:retain ${this.logRotationConfig.retain}`,
      `pm2 set pm2-logrotate:compress ${this.logRotationConfig.compress}`,
      `pm2 set pm2-logrotate:dateFormat ${this.logRotationConfig.dateFormat}`,
      `pm2 set pm2-logrotate:workerInterval ${this.logRotationConfig.workerInterval}`,
      `pm2 set pm2-logrotate:rotateInterval '${this.logRotationConfig.rotateInterval}'`
    ];

    for (const command of rotateCommands) {
      try {
        await execAsync(command);
      } catch (error) {
        console.warn(`Failed to configure log rotation setting: ${command}`, error);
      }
    }
  }

  /**
   * Generate PM2 ecosystem configuration for Titan services
   * Requirement 2.4: Configure PM2 with auto-restart and monitoring
   */
  generateEcosystemConfig(): { apps: PM2ProcessConfig[] } {
    const apps: PM2ProcessConfig[] = [
      // Shared Infrastructure
      {
        name: 'titan-shared',
        script: './dist/index.js',
        cwd: './services/shared',
        instances: 1,
        exec_mode: 'fork',
        env: {
          NODE_ENV: 'production',
          PORT: '3001'
        },
        max_memory_restart: '300M',
        min_uptime: '10s',
        max_restarts: 10,
        restart_delay: 4000,
        autorestart: true,
        watch: false,
        ignore_watch: ['node_modules', 'logs'],
        log_file: './logs/titan-shared-combined.log',
        out_file: './logs/titan-shared-out.log',
        error_file: './logs/titan-shared-error.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        kill_timeout: 1600
      },

      // Security Services
      {
        name: 'titan-security',
        script: './dist/index.js',
        cwd: './services/security',
        instances: 1,
        exec_mode: 'fork',
        env: {
          NODE_ENV: 'production',
          PORT: '3002'
        },
        max_memory_restart: '200M',
        min_uptime: '10s',
        max_restarts: 10,
        restart_delay: 4000,
        autorestart: true,
        watch: false,
        ignore_watch: ['node_modules', 'logs'],
        log_file: './logs/titan-security-combined.log',
        out_file: './logs/titan-security-out.log',
        error_file: './logs/titan-security-error.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        kill_timeout: 1600
      },

      // Titan Brain (Master Orchestrator)
      {
        name: 'titan-brain',
        script: './dist/index.js',
        cwd: './services/titan-brain',
        instances: 1,
        exec_mode: 'fork',
        env: {
          NODE_ENV: 'production',
          PORT: '3000'
        },
        max_memory_restart: '500M',
        min_uptime: '10s',
        max_restarts: 5,
        restart_delay: 4000,
        autorestart: true,
        watch: false,
        ignore_watch: ['node_modules', 'logs', 'test-logs'],
        log_file: './logs/titan-brain-combined.log',
        out_file: './logs/titan-brain-out.log',
        error_file: './logs/titan-brain-error.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        kill_timeout: 1600
      },

      // Titan Execution Service
      {
        name: 'titan-execution',
        script: './server-production.js',
        cwd: './services/titan-execution',
        instances: 1,
        exec_mode: 'fork',
        env: {
          NODE_ENV: 'production',
          PORT: '3003'
        },
        max_memory_restart: '400M',
        min_uptime: '10s',
        max_restarts: 10,
        restart_delay: 4000,
        autorestart: true,
        watch: false,
        ignore_watch: ['node_modules', 'logs', 'coverage'],
        log_file: './logs/titan-execution-combined.log',
        out_file: './logs/titan-execution-out.log',
        error_file: './logs/titan-execution-error.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        kill_timeout: 1600
      },

      // Phase 1 - Scavenger
      {
        name: 'titan-phase1-scavenger',
        script: './dist/index.js',
        cwd: './services/titan-phase1-scavenger',
        instances: 1,
        exec_mode: 'fork',
        env: {
          NODE_ENV: 'production',
          PORT: '3004'
        },
        max_memory_restart: '400M',
        min_uptime: '10s',
        max_restarts: 10,
        restart_delay: 4000,
        autorestart: true,
        watch: false,
        ignore_watch: ['node_modules', 'logs'],
        log_file: './logs/titan-phase1-combined.log',
        out_file: './logs/titan-phase1-out.log',
        error_file: './logs/titan-phase1-error.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        kill_timeout: 1600
      },

      // AI Quant Service
      {
        name: 'titan-ai-quant',
        script: './dist/index.js',
        cwd: './services/titan-ai-quant',
        instances: 1,
        exec_mode: 'fork',
        env: {
          NODE_ENV: 'production',
          PORT: '3005'
        },
        max_memory_restart: '600M',
        min_uptime: '10s',
        max_restarts: 10,
        restart_delay: 4000,
        autorestart: true,
        watch: false,
        ignore_watch: ['node_modules', 'logs'],
        log_file: './logs/titan-ai-quant-combined.log',
        out_file: './logs/titan-ai-quant-out.log',
        error_file: './logs/titan-ai-quant-error.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        kill_timeout: 1600
      },

      // Console Service
      {
        name: 'titan-console',
        script: './server.js',
        cwd: './services/titan-console',
        instances: 1,
        exec_mode: 'fork',
        env: {
          NODE_ENV: 'production',
          PORT: '3006'
        },
        max_memory_restart: '300M',
        min_uptime: '10s',
        max_restarts: 10,
        restart_delay: 4000,
        autorestart: true,
        watch: false,
        ignore_watch: ['node_modules', 'logs', '.next'],
        log_file: './logs/titan-console-combined.log',
        out_file: './logs/titan-console-out.log',
        error_file: './logs/titan-console-error.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        kill_timeout: 1600
      }
    ];

    return { apps };
  }

  /**
   * Save ecosystem configuration to file
   */
  async saveEcosystemConfig(configPath: string = './ecosystem.config.js'): Promise<void> {
    const config = this.generateEcosystemConfig();
    const configContent = `module.exports = ${JSON.stringify(config, null, 2)};`;
    
    await fs.writeFile(configPath, configContent, 'utf8');
    this.emit('ecosystem:saved', { path: configPath });
  }

  /**
   * Start all services using PM2
   */
  async startAll(configPath: string = './ecosystem.config.js'): Promise<void> {
    await this.initialize();
    
    try {
      // Save current ecosystem config
      await this.saveEcosystemConfig(configPath);
      
      // Start all processes
      await execAsync(`pm2 start ${configPath}`);
      
      this.emit('pm2:started');
    } catch (error) {
      throw new Error(`Failed to start PM2 processes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Stop all PM2 processes
   */
  async stopAll(): Promise<void> {
    try {
      await execAsync('pm2 stop all');
      this.emit('pm2:stopped');
    } catch (error) {
      throw new Error(`Failed to stop PM2 processes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Restart all PM2 processes
   */
  async restartAll(): Promise<void> {
    try {
      await execAsync('pm2 restart all');
      this.emit('pm2:restarted');
    } catch (error) {
      throw new Error(`Failed to restart PM2 processes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Reload all PM2 processes (zero-downtime restart)
   */
  async reloadAll(): Promise<void> {
    try {
      await execAsync('pm2 reload all');
      this.emit('pm2:reloaded');
    } catch (error) {
      throw new Error(`Failed to reload PM2 processes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete all PM2 processes
   */
  async deleteAll(): Promise<void> {
    try {
      await execAsync('pm2 delete all');
      this.emit('pm2:deleted');
    } catch (error) {
      throw new Error(`Failed to delete PM2 processes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get status of all PM2 processes
   */
  async getProcessList(): Promise<PM2ProcessStatus[]> {
    try {
      const { stdout } = await execAsync('pm2 jlist');
      const processes = JSON.parse(stdout);
      
      return processes.map((proc: any) => ({
        name: proc.name,
        pid: proc.pid,
        status: proc.pm2_env.status,
        restart_time: proc.pm2_env.restart_time,
        created_at: proc.pm2_env.created_at,
        pm_uptime: proc.pm2_env.pm_uptime,
        memory: proc.monit.memory,
        cpu: proc.monit.cpu,
        monit: proc.monit
      }));
    } catch (error) {
      throw new Error(`Failed to get PM2 process list: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get status of a specific process
   */
  async getProcessStatus(processName: string): Promise<PM2ProcessStatus | null> {
    const processes = await this.getProcessList();
    return processes.find(proc => proc.name === processName) || null;
  }

  /**
   * Start a specific process
   */
  async startProcess(processName: string): Promise<void> {
    try {
      await execAsync(`pm2 start ${processName}`);
      this.emit('process:started', { name: processName });
    } catch (error) {
      throw new Error(`Failed to start process ${processName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Stop a specific process
   */
  async stopProcess(processName: string): Promise<void> {
    try {
      await execAsync(`pm2 stop ${processName}`);
      this.emit('process:stopped', { name: processName });
    } catch (error) {
      throw new Error(`Failed to stop process ${processName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Restart a specific process
   */
  async restartProcess(processName: string): Promise<void> {
    try {
      await execAsync(`pm2 restart ${processName}`);
      this.emit('process:restarted', { name: processName });
    } catch (error) {
      throw new Error(`Failed to restart process ${processName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get logs for a specific process
   */
  async getProcessLogs(processName: string, lines: number = 100): Promise<string> {
    try {
      const { stdout } = await execAsync(`pm2 logs ${processName} --lines ${lines} --nostream`);
      return stdout;
    } catch (error) {
      throw new Error(`Failed to get logs for process ${processName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Flush logs for all processes
   */
  async flushLogs(): Promise<void> {
    try {
      await execAsync('pm2 flush');
      this.emit('logs:flushed');
    } catch (error) {
      throw new Error(`Failed to flush PM2 logs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Monitor PM2 processes (returns monitoring data)
   */
  async getMonitoringData(): Promise<any> {
    try {
      const { stdout } = await execAsync('pm2 prettylist');
      return JSON.parse(stdout);
    } catch (error) {
      throw new Error(`Failed to get PM2 monitoring data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Save current PM2 process list
   */
  async savePM2State(): Promise<void> {
    try {
      await execAsync('pm2 save');
      this.emit('pm2:saved');
    } catch (error) {
      throw new Error(`Failed to save PM2 state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Resurrect PM2 processes from saved state
   */
  async resurrectPM2State(): Promise<void> {
    try {
      await execAsync('pm2 resurrect');
      this.emit('pm2:resurrected');
    } catch (error) {
      throw new Error(`Failed to resurrect PM2 state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update log rotation configuration
   */
  async updateLogRotationConfig(config: Partial<LogRotationConfig>): Promise<void> {
    this.logRotationConfig = { ...this.logRotationConfig, ...config };
    await this.configureLogRotation();
    this.emit('logrotation:updated', this.logRotationConfig);
  }

  /**
   * Get current log rotation configuration
   */
  getLogRotationConfig(): LogRotationConfig {
    return { ...this.logRotationConfig };
  }
}