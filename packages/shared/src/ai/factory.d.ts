/**
 * AI Provider Factory
 *
 * Creates AI provider instances based on configuration.
 * Supports fallback chain for resilience.
 *
 * @module @titan/shared/ai
 */
import type { AIProvider, AIProviderConfig, AIProviderType, KimiK2Config } from './types.js';
export interface AIProviderFactoryConfig {
    /** Primary provider to use */
    primary: AIProviderType;
    /** Fallback provider if primary fails */
    fallback?: AIProviderType;
    /** Provider-specific configurations */
    providers?: {
        kimi?: KimiK2Config;
        'kimi-local'?: KimiK2Config;
        gemini?: AIProviderConfig;
        openai?: AIProviderConfig;
    };
}
/**
 * Get or create a provider instance
 */
export declare function getAIProvider(type: AIProviderType, config?: AIProviderConfig): AIProvider;
/**
 * Create a provider instance without caching
 */
export declare function createProvider(type: AIProviderType, config?: AIProviderConfig): AIProvider;
/**
 * Create a provider chain with automatic fallback
 */
export declare function createProviderChain(config: AIProviderFactoryConfig): AIProviderChain;
/**
 * Clear provider registry (for testing)
 */
export declare function clearProviderRegistry(): void;
export declare class AIProviderChain {
    private readonly primary;
    private readonly fallback?;
    constructor(config: AIProviderFactoryConfig);
    /**
     * Get primary provider
     */
    getPrimary(): AIProvider;
    /**
     * Get fallback provider (if configured)
     */
    getFallback(): AIProvider | undefined;
    /**
     * Get best available provider
     */
    getAvailable(): AIProvider;
    /**
     * Execute with automatic fallback on failure
     */
    executeWithFallback<T>(fn: (provider: AIProvider) => Promise<T>): Promise<T>;
}
/**
 * Create provider based on environment variables
 *
 * Checks in order:
 * 1. AI_PROVIDER env var (explicit selection)
 * 2. KIMI_API_KEY / MOONSHOT_API_KEY (Kimi available)
 * 3. GEMINI_API_KEY (Gemini available)
 */
export declare function createProviderFromEnv(): AIProvider;
//# sourceMappingURL=factory.d.ts.map