/**
 * AI Provider Factory
 *
 * Creates AI provider instances based on configuration.
 * Supports fallback chain for resilience.
 *
 * @module @titan/shared/ai
 */
import { KimiK2Provider } from './KimiK2Provider.js';
// ============================================================================
// Singleton Registry
// ============================================================================
const providerRegistry = new Map();
// ============================================================================
// Factory Functions
// ============================================================================
/**
 * Get or create a provider instance
 */
export function getAIProvider(type, config) {
    // Check registry first
    const existing = providerRegistry.get(type);
    if (existing) {
        return existing;
    }
    // Create new provider
    const provider = createProvider(type, config);
    // eslint-disable-next-line functional/immutable-data -- Singleton registry pattern
    providerRegistry.set(type, provider);
    return provider;
}
/**
 * Create a provider instance without caching
 */
export function createProvider(type, config) {
    switch (type) {
        case 'kimi':
            return new KimiK2Provider({
                type: 'kimi',
                ...config,
            });
        case 'kimi-local': {
            const localEndpoint = config?.localEndpoint ?? process.env.KIMI_LOCAL_ENDPOINT;
            if (!localEndpoint) {
                throw new Error('KIMI_LOCAL_ENDPOINT environment variable or localEndpoint config required for kimi-local provider');
            }
            return new KimiK2Provider({
                type: 'kimi',
                selfHosted: true,
                localEndpoint,
                ...config,
            });
        }
        case 'gemini':
            // Placeholder - would need adapter for existing GeminiClient
            throw new Error('Gemini provider requires @titan/ai-quant/GeminiClient. Use getGeminiAdapter() instead.');
        case 'openai':
            // Placeholder for future OpenAI support
            throw new Error('OpenAI provider not yet implemented');
        default:
            throw new Error(`Unknown provider type: ${type}`);
    }
}
/**
 * Create a provider chain with automatic fallback
 */
export function createProviderChain(config) {
    return new AIProviderChain(config);
}
/**
 * Clear provider registry (for testing)
 */
export function clearProviderRegistry() {
    // eslint-disable-next-line functional/immutable-data -- Registry clear for testing
    providerRegistry.clear();
}
// ============================================================================
// Provider Chain (Fallback Support)
// ============================================================================
export class AIProviderChain {
    primary;
    fallback;
    constructor(config) {
        const primaryConfig = config.providers?.[config.primary];
        this.primary = createProvider(config.primary, primaryConfig);
        if (config.fallback) {
            const fallbackConfig = config.providers?.[config.fallback];
            try {
                this.fallback = createProvider(config.fallback, fallbackConfig);
            }
            catch {
                // Fallback provider not available - that's OK
                console.warn(`Fallback provider ${config.fallback} not available`);
            }
        }
    }
    /**
     * Get primary provider
     */
    getPrimary() {
        return this.primary;
    }
    /**
     * Get fallback provider (if configured)
     */
    getFallback() {
        return this.fallback;
    }
    /**
     * Get best available provider
     */
    getAvailable() {
        if (this.primary.isAvailable()) {
            return this.primary;
        }
        if (this.fallback?.isAvailable()) {
            return this.fallback;
        }
        // Return primary anyway - let it fail with proper error
        return this.primary;
    }
    /**
     * Execute with automatic fallback on failure
     */
    async executeWithFallback(fn) {
        try {
            return await fn(this.primary);
        }
        catch (primaryError) {
            if (this.fallback?.isAvailable()) {
                console.warn('Primary provider failed, using fallback', primaryError);
                return fn(this.fallback);
            }
            throw primaryError;
        }
    }
}
// ============================================================================
// Environment-Based Factory
// ============================================================================
/**
 * Create provider based on environment variables
 *
 * Checks in order:
 * 1. AI_PROVIDER env var (explicit selection)
 * 2. KIMI_API_KEY / MOONSHOT_API_KEY (Kimi available)
 * 3. GEMINI_API_KEY (Gemini available)
 */
export function createProviderFromEnv() {
    const explicitProvider = process.env.AI_PROVIDER;
    if (explicitProvider) {
        return getAIProvider(explicitProvider);
    }
    // Check for self-hosted Kimi first (highest priority)
    if (process.env.KIMI_LOCAL_ENDPOINT) {
        return getAIProvider('kimi-local');
    }
    // Check for Kimi cloud credentials
    if (process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY) {
        return getAIProvider('kimi');
    }
    // Fall back to Gemini
    if (process.env.GEMINI_API_KEY) {
        throw new Error('Gemini provider requires adapter. Set AI_PROVIDER=kimi and provide KIMI_API_KEY.');
    }
    throw new Error('No AI provider configured. Set AI_PROVIDER and corresponding API key environment variable.');
}
//# sourceMappingURL=factory.js.map