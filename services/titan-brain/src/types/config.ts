/**
 * Configuration Types for Titan Brain
 * Defines the complete configuration schema
 */

import { AllocationEngineConfig } from "./allocation.js";
import { PerformanceTrackerConfig } from "./performance.js";
import { RiskGuardianConfig } from "./risk.js";
import { CapitalFlowConfig } from "./capital.js";
import { CircuitBreakerConfig } from "./breaker.js";
import { BrainConfig } from "./brain.js";

/**
 * Database configuration
 */
export interface DatabaseConfig {
  url?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  maxConnections?: number;
  idleTimeout?: number;
}

/**
 * Redis configuration
 */
export interface RedisConfig {
  url: string;
  maxRetries: number;
  retryDelay: number;
}

/**
 * Server configuration
 */
export interface ServerConfig {
  host: string;
  port: number;
  corsOrigins: string[];
}

/**
 * HMAC verification configuration
 */
export interface HmacConfig {
  enabled: boolean;
  secret: string;
  headerName: string;
  algorithm: string;
}

/**
 * Notification configuration
 */
export interface NotificationConfig {
  telegram: {
    enabled: boolean;
    botToken?: string;
    chatId?: string;
  };
  email: {
    enabled: boolean;
    smtpHost?: string;
    smtpPort?: number;
    from?: string;
    to?: string[];
  };
}

/**
 * Complete Titan Brain configuration
 */
export interface TitanBrainConfig {
  brain: BrainConfig;
  allocationEngine: AllocationEngineConfig;
  performanceTracker: PerformanceTrackerConfig;
  riskGuardian: RiskGuardianConfig;
  capitalFlow: CapitalFlowConfig;
  circuitBreaker: CircuitBreakerConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  server: ServerConfig;
  notifications: NotificationConfig;
  services: ServicesConfig;
}

/**
 * External Services configuration
 */
export interface ServicesConfig {
  executionUrl?: string;
  phase1WebhookUrl?: string;
  phase2WebhookUrl?: string;
  phase3WebhookUrl?: string;
}

/**
 * Environment variables schema
 */
export interface EnvConfig {
  NODE_ENV: "development" | "production" | "test";
  DB_HOST: string;
  DB_PORT: string;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  REDIS_URL: string;
  SERVER_HOST: string;
  SERVER_PORT: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  BYBIT_API_KEY?: string;
  BYBIT_API_SECRET?: string;
}
