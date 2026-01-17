/**
 * Logger - structured logging with correlation IDs and performance tracking
 *
 * Re-exports Shared Logger with Brain-specific defaults.
 *
 * Requirements: 4.1.1, 4.1.2, 4.1.3, 4.1.4, 4.1.5
 */

import {
  LogEntry,
  Logger as SharedLogger,
  LoggerConfig,
  PerformanceTimer,
  SharedLogLevel,
} from '@titan/shared';

// Re-export types
export { LogEntry, LoggerConfig, PerformanceTimer };
export const LogLevel = SharedLogLevel;
export type LogLevel = SharedLogLevel;

export class Logger extends SharedLogger {
  /**
   * Create logger configuration from environment variables
   */
  static createConfigFromEnv(component: string = 'titan-brain'): LoggerConfig {
    return SharedLogger.createConfigFromEnv(component);
  }

  /**
   * Get or create singleton logger instance
   */
  static getInstance(component: string = 'titan-brain'): Logger {
    // Return the shared singleton, cast to Logger since we know it has a compatible interface
    return SharedLogger.getInstance(component) as unknown as Logger;
  }
}
