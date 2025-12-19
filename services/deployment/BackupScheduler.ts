/**
 * Backup Scheduler for Titan Production Deployment
 * 
 * Provides automated scheduling for daily backups with cron-like functionality.
 * 
 * Requirements: 6.1
 */

import EventEmitter from 'eventemitter3';
import { BackupService, BackupConfig, BackupResult } from './BackupService';

export interface SchedulerConfig {
  /** Cron expression for backup schedule (default: daily at 2 AM) */
  schedule: string;
  /** Whether scheduler is enabled */
  enabled: boolean;
  /** Maximum concurrent backups */
  maxConcurrentBackups: number;
  /** Retry attempts for failed backups */
  retryAttempts: number;
  /** Retry delay in milliseconds */
  retryDelay: number;
}

export interface ScheduledBackupResult {
  /** Scheduled execution timestamp */
  scheduledTime: Date;
  /** Actual execution timestamp */
  executedTime: Date;
  /** Backup result if successful */
  backupResult?: BackupResult;
  /** Error message if failed */
  error?: string;
  /** Number of retry attempts made */
  retryAttempts: number;
}

export class BackupScheduler extends EventEmitter {
  private config: SchedulerConfig;
  private backupService: BackupService;
  private schedulerTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private activeBackups: Set<string> = new Set();

  constructor(config: SchedulerConfig, backupService: BackupService) {
    super();
    this.config = config;
    this.backupService = backupService;
    this.validateConfig();
  }

  /**
   * Validate scheduler configuration
   */
  private validateConfig(): void {
    if (!this.config.schedule) {
      throw new Error('Backup schedule is required');
    }
    if (this.config.maxConcurrentBackups < 1) {
      throw new Error('Maximum concurrent backups must be at least 1');
    }
  }

  /**
   * Start the backup scheduler
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    if (!this.config.enabled) {
      this.emit('scheduler:disabled');
      return;
    }

    this.isRunning = true;
    this.scheduleNextBackup();
    this.emit('scheduler:started', { schedule: this.config.schedule });
  }

  /**
   * Stop the backup scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.schedulerTimer) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }

    this.emit('scheduler:stopped');
  }

  /**
   * Trigger immediate backup (outside of schedule)
   */
  async triggerBackup(): Promise<ScheduledBackupResult> {
    const scheduledTime = new Date();
    const executedTime = new Date();

    if (this.activeBackups.size >= this.config.maxConcurrentBackups) {
      const error = 'Maximum concurrent backups reached';
      this.emit('backup:rejected', { scheduledTime, error });
      
      return {
        scheduledTime,
        executedTime,
        error,
        retryAttempts: 0
      };
    }

    return await this.executeBackup(scheduledTime, executedTime);
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    nextBackupTime: Date | null;
    activeBackups: number;
    schedule: string;
  } {
    return {
      isRunning: this.isRunning,
      nextBackupTime: this.getNextBackupTime(),
      activeBackups: this.activeBackups.size,
      schedule: this.config.schedule
    };
  }

  /**
   * Schedule the next backup based on cron expression
   */
  private scheduleNextBackup(): void {
    if (!this.isRunning) {
      return;
    }

    const nextTime = this.getNextBackupTime();
    if (!nextTime) {
      this.emit('scheduler:error', { error: 'Unable to calculate next backup time' });
      return;
    }

    const delay = nextTime.getTime() - Date.now();
    
    this.schedulerTimer = setTimeout(async () => {
      const scheduledTime = nextTime;
      const executedTime = new Date();
      
      try {
        await this.executeBackup(scheduledTime, executedTime);
      } catch (error) {
        this.emit('backup:failed', { 
          scheduledTime, 
          executedTime, 
          error: error.message 
        });
      }
      
      // Schedule next backup
      this.scheduleNextBackup();
    }, delay);

    this.emit('backup:scheduled', { nextTime });
  }

  /**
   * Execute backup with retry logic
   */
  private async executeBackup(
    scheduledTime: Date, 
    executedTime: Date
  ): Promise<ScheduledBackupResult> {
    const backupId = `scheduled_${Date.now()}`;
    
    if (this.activeBackups.size >= this.config.maxConcurrentBackups) {
      const error = 'Maximum concurrent backups reached';
      return {
        scheduledTime,
        executedTime,
        error,
        retryAttempts: 0
      };
    }

    this.activeBackups.add(backupId);
    let retryAttempts = 0;

    try {
      this.emit('backup:started', { backupId, scheduledTime, executedTime });

      while (retryAttempts <= this.config.retryAttempts) {
        try {
          const backupResult = await this.backupService.createBackup();
          
          const result: ScheduledBackupResult = {
            scheduledTime,
            executedTime,
            backupResult,
            retryAttempts
          };

          this.emit('backup:completed', result);
          return result;

        } catch (error) {
          retryAttempts++;
          
          if (retryAttempts <= this.config.retryAttempts) {
            this.emit('backup:retry', { 
              backupId, 
              attempt: retryAttempts, 
              error: error.message 
            });
            
            // Wait before retry
            await this.delay(this.config.retryDelay);
          } else {
            throw error;
          }
        }
      }

      // This should never be reached, but just in case
      throw new Error('Maximum retry attempts exceeded');

    } catch (error) {
      const result: ScheduledBackupResult = {
        scheduledTime,
        executedTime,
        error: error.message,
        retryAttempts
      };

      this.emit('backup:failed', result);
      return result;

    } finally {
      this.activeBackups.delete(backupId);
    }
  }

  /**
   * Calculate next backup time based on cron expression
   */
  private getNextBackupTime(): Date | null {
    try {
      return this.parseCronExpression(this.config.schedule);
    } catch (error) {
      this.emit('scheduler:error', { 
        error: `Invalid cron expression: ${this.config.schedule}` 
      });
      return null;
    }
  }

  /**
   * Parse cron expression and return next execution time
   * Supports basic cron format: minute hour day month dayOfWeek
   */
  private parseCronExpression(cronExpr: string): Date {
    const parts = cronExpr.trim().split(/\s+/);
    
    if (parts.length !== 5) {
      throw new Error('Cron expression must have 5 parts: minute hour day month dayOfWeek');
    }

    const [minute, hour, day, month, dayOfWeek] = parts;
    const now = new Date();
    const next = new Date(now);

    // Set to next occurrence
    next.setSeconds(0);
    next.setMilliseconds(0);

    // Parse minute
    if (minute !== '*') {
      const min = parseInt(minute, 10);
      if (isNaN(min) || min < 0 || min > 59) {
        throw new Error('Invalid minute value');
      }
      next.setMinutes(min);
    }

    // Parse hour
    if (hour !== '*') {
      const hr = parseInt(hour, 10);
      if (isNaN(hr) || hr < 0 || hr > 23) {
        throw new Error('Invalid hour value');
      }
      next.setHours(hr);
    }

    // If the calculated time is in the past, add one day
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    // For simplicity, we'll support daily backups (ignoring day, month, dayOfWeek for now)
    // A full cron parser would be more complex and is beyond the scope of this implementation

    return next;
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Default configuration
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  schedule: '0 2 * * *', // Daily at 2 AM
  enabled: true,
  maxConcurrentBackups: 1,
  retryAttempts: 3,
  retryDelay: 5000 // 5 seconds
};

// Singleton instance
let schedulerInstance: BackupScheduler | null = null;

/**
 * Get or create BackupScheduler instance
 */
export function getBackupScheduler(
  config?: SchedulerConfig, 
  backupService?: BackupService
): BackupScheduler {
  if (!schedulerInstance && config && backupService) {
    schedulerInstance = new BackupScheduler(config, backupService);
  }
  
  if (!schedulerInstance) {
    throw new Error('BackupScheduler not initialized. Provide config and backupService on first call.');
  }
  
  return schedulerInstance;
}

/**
 * Reset BackupScheduler instance (for testing)
 */
export function resetBackupScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
    schedulerInstance = null;
  }
}