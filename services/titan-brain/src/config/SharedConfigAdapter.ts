import { EventEmitter } from "events";
import {
    ConfigManager as SharedConfigManager,
    getConfigManager,
} from "@titan/shared";
import { BrainConfig, ConfigDefaults } from "./BrainConfig.js";

/**
 * Adapter to bridge @titan/shared ConfigManager with Brain's local configuration requirements.
 * Implements the same interface as the old local ConfigManager.
 */
export class SharedConfigAdapter extends EventEmitter {
    private sharedManager: SharedConfigManager;
    private config: BrainConfig | null = null;
    private logger: any; // Using any to avoid circular dependency issues, will be compatible with Logger

    constructor(logger?: any) {
        super();
        this.sharedManager = getConfigManager();
        // Logger is optional in constructor, will use shared logger if needed or console
        this.logger = logger || {
            info: console.log,
            warn: console.warn,
            error: console.error,
        };
    }

    /**
     * Load and validate configuration from shared config manager
     */
    async loadConfig(): Promise<BrainConfig> {
        this.logger.info("Loading configuration via SharedConfigAdapter...");

        // 1. Load Brain Config (Business Logic)
        const sharedBrainConfig = await this.sharedManager.loadBrainConfig();

        // 2. Load Service Config (Infrastructure)
        const serviceConfig = await this.sharedManager.loadServiceConfig(
            "titan-brain",
        );

        // 3. Merge and Map to BrainConfig interface
        this.config = this.mapToBrainConfig(sharedBrainConfig, serviceConfig);

        this.logger.info("Configuration loaded successfully");
        this.emit("config:loaded", this.config);
        return this.config;
    }

    /**
     * Map shared config objects to local BrainConfig interface
     */
    private mapToBrainConfig(
        brainConfig: any,
        serviceConfig: any,
    ): BrainConfig {
        // Default environment
        const nodeEnv =
            (process.env.NODE_ENV as "development" | "production" | "test") ||
            "development";
        const defaults = ConfigDefaults[nodeEnv];

        // Construct Database URL
        let databaseUrl = process.env.DATABASE_URL;

        // Priority to TITAN_DB_* variables for self-hosted setup
        if (process.env.TITAN_DB_HOST) {
            const host = process.env.TITAN_DB_HOST;
            const port = process.env.TITAN_DB_PORT || "5432";
            const user = process.env.TITAN_DB_USER || "postgres";
            const pass = process.env.TITAN_DB_PASSWORD || "postgres";
            const name = process.env.TITAN_DB_NAME || "titan_brain";
            databaseUrl = `postgres://${user}:${pass}@${host}:${port}/${name}`;
        }

        if (!databaseUrl && serviceConfig.database) {
            const db = serviceConfig.database;
            databaseUrl =
                `postgres://${db.user}:${db.password}@${db.host}:${db.port}/${db.name}`;
            if (db.ssl) {
                databaseUrl += "?sslmode=require";
            }
        }
        if (!databaseUrl) {
            throw new Error("Database URL not found in config or env");
        }

        return {
            // Core
            nodeEnv,
            port: serviceConfig.port || parseInt(process.env.PORT || "3000"),
            host: process.env.HOST || "0.0.0.0",

            // Database
            databaseUrl,
            databaseHost: process.env.TITAN_DB_HOST ||
                serviceConfig.database?.host,
            databasePort: parseInt(
                process.env.TITAN_DB_PORT || serviceConfig.database?.port ||
                    "5432",
            ),
            databaseUser: process.env.TITAN_DB_USER ||
                serviceConfig.database?.user,
            databasePassword: process.env.TITAN_DB_PASSWORD ||
                serviceConfig.database?.password,
            databaseName: process.env.TITAN_DB_NAME ||
                serviceConfig.database?.name,
            databasePoolMin: parseInt(process.env.DATABASE_POOL_MIN || "2"),
            databasePoolMax: parseInt(process.env.DATABASE_POOL_MAX || "10"),

            // Redis
            redisUrl: serviceConfig.redis?.url || process.env.REDIS_URL,

            // NATS
            natsUrl: process.env.NATS_URL,

            // Security
            hmacSecret: process.env.HMAC_SECRET,
            hmacAlgorithm:
                (process.env.HMAC_ALGORITHM as "sha256" | "sha512") || "sha256",

            // Logging
            logLevel: (serviceConfig.logLevel as any) || defaults.logLevel,

            // Rate Limiting
            rateLimitWindowMs: parseInt(
                process.env.RATE_LIMIT_WINDOW_MS ||
                    String(defaults.rateLimitWindowMs),
            ),
            rateLimitMaxRequests: parseInt(
                process.env.RATE_LIMIT_MAX_REQUESTS ||
                    String(defaults.rateLimitMaxRequests),
            ),

            // Health
            healthCheckInterval: parseInt(
                process.env.HEALTH_CHECK_INTERVAL ||
                    String(defaults.healthCheckInterval),
            ),

            // Service Discovery
            phase1ServiceUrl: brainConfig.phase1ServiceUrl ||
                process.env.PHASE1_SERVICE_URL, // Adapting if shared config has this
            phase2ServiceUrl: brainConfig.phase2ServiceUrl ||
                process.env.PHASE2_SERVICE_URL,
            phase3ServiceUrl: brainConfig.phase3ServiceUrl ||
                process.env.PHASE3_SERVICE_URL,

            // Deployment
            deploymentEnvironment: process.env.DEPLOYMENT_ENVIRONMENT,
            serviceName: process.env.SERVICE_NAME,

            // CORS
            corsOrigins: this.parseCorsOrigins(process.env.CORS_ORIGINS || "*"),

            // Startup
            startupTimeout: parseInt(
                process.env.STARTUP_TIMEOUT || String(defaults.startupTimeout),
            ),
            shutdownTimeout: parseInt(
                process.env.SHUTDOWN_TIMEOUT ||
                    String(defaults.shutdownTimeout),
            ),

            // Risk (Business Logic from Shared BrainConfig)
            risk: {
                maxLeverage: brainConfig.maxTotalLeverage ||
                    defaults.risk.maxLeverage,
                fatTailBuffer: brainConfig.fatTailBuffer ||
                    defaults.risk.fatTailBuffer, // Check if this field exists in shared schema
                tailIndexThreshold: brainConfig.tailIndexThreshold ||
                    defaults.risk.tailIndexThreshold,
                maxImpactBps: brainConfig.maxImpactBps ||
                    defaults.risk.maxImpactBps,
            },
        };
    }

    private parseCorsOrigins(corsOriginsStr: string): string[] {
        if (corsOriginsStr === "*") return ["*"];
        return corsOriginsStr.split(",").map((o) => o.trim()).filter((o) =>
            o.length > 0
        );
    }

    getConfig(): BrainConfig {
        if (!this.config) throw new Error("Configuration not loaded");
        return { ...this.config };
    }

    getDatabaseConfig() {
        if (!this.config) throw new Error("Configuration not loaded");
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
