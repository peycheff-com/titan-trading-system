/**
 * AI Provider Module
 *
 * Unified AI provider abstraction for Titan Trading System.
 * Supports Kimi K2.5 (primary) and Gemini (legacy) providers.
 *
 * @module @titan/shared/ai
 */
// Providers
export { KimiK2Provider } from './KimiK2Provider.js';
// Factory
export { AIProviderChain, clearProviderRegistry, createProvider, createProviderChain, createProviderFromEnv, getAIProvider, } from './factory.js';
//# sourceMappingURL=index.js.map