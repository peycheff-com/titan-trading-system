import { EventEmitter } from 'events';
import { ConfigManager as SharedConfigManager, getConfigManager, Logger } from '@titan/shared';
import { BrainConfig, ConfigDefaults } from './BrainConfig.js';

/**
 * Adapter to bridge @titan/shared ConfigManager with Brain's local configuration requirements.
 * Implements the same interface as the old local ConfigManager.
 */
export class SharedConfigAdapter extends EventEmitter {
  private readonly sharedManager: SharedConfigManager;
  private config: BrainConfig | null = null;

  private readonly logger: Logger;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(logger?: any) {
    super();
    this.sharedManager = getConfigManager();
    // Logger is optional in constructor, will use shared logger if needed or console
    this.logger =
      logger ||
      ({
        info: console.log,
        warn: console.warn,
        error: console.error,
        debug: console.debug,
      } as Logger);
  }

  /**
   * Load and validate configuration from shared config manager
   */
  async loadConfig(): Promise<BrainConfig> {
    this.logger.info('Loading configuration via SharedConfigAdapter...');

    // 1. Load Brain Config (Business Logic)
    let sharedBrainConfig: any = {};
    try {
      sharedBrainConfig = await this.sharedManager.loadBrainConfig();
    } catch (error: any) {
      this.logger.warn(
        'Failed to load brain config from shared manager, falling back to defaults/env',
        error,
      );
    }

    // 2. Load Service Config (Infrastructure)
    let serviceConfig: any = {};
    try {
      serviceConfig = await this.sharedManager.loadServiceConfig('titan-brain');
    } catch (error: any) {
      this.logger.warn(
        'Failed to load service config from shared manager, falling back to defaults/env',
        error,
      );
    }

    // 3. Merge and Map to BrainConfig interface

    this.config = this.mapToBrainConfig(sharedBrainConfig, serviceConfig);

    this.logger.info('Configuration loaded successfully');
    this.emit('config:loaded', this.config);
    return this.config;
  }

  /**
   * Map shared config objects to local BrainConfig interface
   */

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapToBrainConfig(brainConfig: any, serviceConfig: any): BrainConfig {
    const nodeEnv =
      (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development';
    const defaults = ConfigDefaults[nodeEnv];

    const dbConfig = this.mapDatabaseConfig(serviceConfig);
    const coreConfig = this.mapCoreConfig(serviceConfig, defaults, brainConfig);
    const riskConfig = this.mapRiskConfig(brainConfig, defaults);

    return {
      nodeEnv,
      ...coreConfig,
      ...dbConfig,
      risk: riskConfig,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapDatabaseConfig(serviceConfig: any): any {
    const envUrl = process.env.DATABASE_URL;
    const constructedUrl = this.getConstructedUrl();
    const serviceUrl = this.getServiceUrl(serviceConfig);

    const databaseUrl = envUrl || constructedUrl || serviceUrl;

    if (!databaseUrl) {
      throw new Error('Database URL not found in config or env');
    }

    return {
      databaseUrl,
      databaseHost: process.env.TITAN_DB_HOST || serviceConfig.database?.host,
      databasePort: parseInt(process.env.TITAN_DB_PORT || serviceConfig.database?.port || '5432'),
      databaseUser: process.env.TITAN_DB_USER || serviceConfig.database?.user,
      databasePassword: process.env.TITAN_DB_PASSWORD || serviceConfig.database?.password,
      databaseName: process.env.TITAN_DB_NAME || serviceConfig.database?.name,
      databasePoolMin: parseInt(process.env.DATABASE_POOL_MIN || '2'),
      databasePoolMax: parseInt(process.env.DATABASE_POOL_MAX || '10'),
    };
  }

  private getConstructedUrl(): string | undefined {
    if (!process.env.TITAN_DB_HOST) return undefined;
    const host = process.env.TITAN_DB_HOST;
    const port = process.env.TITAN_DB_PORT || '5432';
    const user = process.env.TITAN_DB_USER || 'postgres';
    const pass = process.env.TITAN_DB_PASSWORD || 'postgres';
    const name = process.env.TITAN_DB_NAME || 'titan_brain';
    return `postgres://${user}:${pass}@${host}:${port}/${name}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getServiceUrl(serviceConfig: any): string | undefined {
    if (!serviceConfig.database) return undefined;
    const db = serviceConfig.database;
    const base = `postgres://${db.user}:${db.password}@${db.host}:${db.port}/${db.name}`;
    return db.ssl ? `${base}?sslmode=require` : base;
  }

  private mapCoreConfig(serviceConfig: any, defaults: any, brainConfig: any): any {
    return {
      // Core
      port: serviceConfig.port || parseInt(process.env.PORT || '3000'),
      host: process.env.HOST || '0.0.0.0',

      // Redis
      redisUrl: process.env.REDIS_URL || serviceConfig.redis?.url,

      // NATS
      natsUrl: process.env.NATS_URL,

      // Security
      hmacSecret: process.env.HMAC_SECRET,
      hmacAlgorithm: (process.env.HMAC_ALGORITHM as 'sha256' | 'sha512') || 'sha256',

      // Logging

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logLevel: (serviceConfig.logLevel as any) || defaults.logLevel,

      // Rate Limiting
      rateLimitWindowMs: parseInt(
        process.env.RATE_LIMIT_WINDOW_MS || String(defaults.rateLimitWindowMs),
      ),
      rateLimitMaxRequests: parseInt(
        process.env.RATE_LIMIT_MAX_REQUESTS || String(defaults.rateLimitMaxRequests),
      ),

      // Health
      healthCheckInterval: parseInt(
        process.env.HEALTH_CHECK_INTERVAL || String(defaults.healthCheckInterval),
      ),

      // Service Discovery
      phase1ServiceUrl: brainConfig.phase1ServiceUrl || process.env.PHASE1_SERVICE_URL,
      phase2ServiceUrl: brainConfig.phase2ServiceUrl || process.env.PHASE2_SERVICE_URL,
      phase3ServiceUrl: brainConfig.phase3ServiceUrl || process.env.PHASE3_SERVICE_URL,

      // Deployment
      deploymentEnvironment: process.env.DEPLOYMENT_ENVIRONMENT,
      serviceName: process.env.SERVICE_NAME,

      // CORS
      corsOrigins: this.parseCorsOrigins(process.env.CORS_ORIGINS || '*'),

      // Startup
      startupTimeout: parseInt(process.env.STARTUP_TIMEOUT || String(defaults.startupTimeout)),
      shutdownTimeout: parseInt(process.env.SHUTDOWN_TIMEOUT || String(defaults.shutdownTimeout)),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapRiskConfig(brainConfig: any, defaults: any): any {
    return {
      maxLeverage: brainConfig.maxTotalLeverage || defaults.risk.maxLeverage,
      fatTailBuffer: brainConfig.fatTailBuffer || defaults.risk.fatTailBuffer,
      tailIndexThreshold: brainConfig.tailIndexThreshold || defaults.risk.tailIndexThreshold,
      maxImpactBps: brainConfig.maxImpactBps || defaults.risk.maxImpactBps,
    };
  }

  private parseCorsOrigins(corsOriginsStr: string): string[] {
    if (corsOriginsStr === '*') return ['*'];
    return corsOriginsStr
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
  }

  getConfig(): BrainConfig {
    if (!this.config) throw new Error('Configuration not loaded');
    return { ...this.config };
  }

  getDatabaseConfig() {
    if (!this.config) throw new Error('Configuration not loaded');
    return {
      url: this.config.databaseUrl,
      host: this.config.databaseHost,
      port: this.config.databasePort,
      user: this.config.databaseUser,
      password: this.config.databasePassword,
      database: this.config.databaseName,
      poolMin: this.config.databasePoolMin,
      poolMax: this.config.databasePoolMax,
    };
  }

  // Add other getter methods if ConfigManager had them and they are used
  // For now relying on getConfig() which seems to be the main one used in index.ts for creating other services
}
